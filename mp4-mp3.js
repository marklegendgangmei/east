<script>
    // Elements
    const drop = document.getElementById('drop');
    const fileInput = document.getElementById('fileInput');
    const convertBtn = document.getElementById('convertBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const bitrateEl = document.getElementById('bitrate');
    const progressWrap = document.getElementById('progressWrap');
    const progressBar = document.getElementById('progressBar');
    const statusText = document.getElementById('statusText');
    const resultDiv = document.getElementById('result');
    const downloadLink = document.getElementById('downloadLink');
    const audioPreview = document.getElementById('audioPreview');

    let selectedFile = null;
    let ffmpeg = null;
    let abortRequested = false;

    // Drag/drop
    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', e => { e.preventDefault(); drop.classList.remove('dragover'); });
    drop.addEventListener('drop', e => {
      e.preventDefault(); drop.classList.remove('dragover');
      const f = e.dataTransfer.files[0];
      handleFileSelection(f);
    });

    fileInput.addEventListener('change', (e) => handleFileSelection(e.target.files[0]));

    function handleFileSelection(file) {
      if (!file) return;
      selectedFile = file;
      drop.querySelector('p').textContent = `Selected: ${file.name} (${Math.round(file.size/1024/1024*100)/100} MB)`;
      resultDiv.classList.add('d-none');
    }

    // Load ffmpeg lazily
    async function ensureFFmpeg() {
      if (ffmpeg) return ffmpeg;
      if (!window.FFmpeg || !window.FFmpeg.createFFmpeg) {
        throw new Error('FFmpeg library not loaded. Check your internet connection and the CDN.');
      }
      ffmpeg = window.FFmpeg.createFFmpeg({ log: true });
      ffmpeg.setProgress(({ ratio }) => {
        const pct = Math.min(100, Math.round(ratio * 100));
        progressBar.style.width = pct + '%';
        progressBar.textContent = pct + '%';
        statusText.textContent = `FFmpeg progress: ${pct}%`;
      });
      statusText.textContent = 'Loading FFmpeg (this may take a few seconds)...';
      await ffmpeg.load();
      return ffmpeg;
    }

    convertBtn.addEventListener('click', async () => {
      if (!selectedFile) return alert('Please pick an MP4 file first.');
      if (!selectedFile.type.startsWith('video') && !selectedFile.name.endsWith('.mp4')) {
        if (!confirm('Selected file does not appear to be an MP4. Continue anyway?')) return;
      }

      convertBtn.disabled = true;
      cancelBtn.disabled = false;
      progressWrap.classList.remove('d-none');
      progressBar.style.width = '0%';
      progressBar.textContent = '0%';
      statusText.textContent = 'Preparing...';
      abortRequested = false;

      try {
        await ensureFFmpeg();

        const inName = 'input.mp4';
        const outName = 'output.mp3';
        const bitrate = bitrateEl.value || '128k';

        statusText.textContent = 'Reading file into virtual FS...';
        const data = await fetchFileFromBlob(selectedFile);
        ffmpeg.FS('writeFile', inName, data);

        statusText.textContent = 'Running conversion...';

        // Basic command: extract audio and encode to mp3
        // -y overwrite, -i input, -vn no video, -ab audio bitrate, -map a map audio
        await ffmpeg.run('-y', '-i', inName, '-vn', '-ab', bitrate, '-map', 'a', outName);

        statusText.textContent = 'Reading output file...';
        const outData = ffmpeg.FS('readFile', outName);
        const blob = new Blob([outData.buffer], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);

        downloadLink.href = url;
        downloadLink.download = (selectedFile.name.replace(/\.[^.]+$/, '') || 'converted') + '.mp3';
        downloadLink.textContent = 'Download MP3 (' + Math.round(blob.size/1024) + ' KB)';
        audioPreview.src = url;

        resultDiv.classList.remove('d-none');
        statusText.textContent = 'Conversion complete.';

      } catch (err) {
        console.error(err);
        alert('Conversion failed: ' + err.message);
        statusText.textContent = 'Error: ' + (err.message || err);
      } finally {
        convertBtn.disabled = false;
        cancelBtn.disabled = true;
      }
    });

    cancelBtn.addEventListener('click', () => {
      // ffmpeg.wasm doesn't support aborting runs reliably in older builds; this sets a flag.
      abortRequested = true;
      statusText.textContent = 'Abort requested (may take a moment)...';
    });

    // Helper: convert File/Blob to Uint8Array using fetch-file helper if available
    async function fetchFileFromBlob(blob) {
      // If FFmpeg's fetchFile helper is available, use it, else fallback
      if (window.FFmpeg && window.FFmpeg.fetchFile) return window.FFmpeg.fetchFile(blob);
      // fallback
      const arr = await blob.arrayBuffer();
      return new Uint8Array(arr);
    }

    // Small usability: support paste of a URL? Not in this simple demo.

    // Initial small check
    (function checkSupport(){
      if (!window.fetch || !window.Blob) {
        alert('Your browser is very old and may not support this demo. Use Chrome, Edge or Firefox (desktop).');
      }
    })();

  </script>
