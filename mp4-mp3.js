<script>
    (function(){
      const { createFFmpeg, fetchFile } = FFmpeg;
      const ffmpeg = createFFmpeg({ log: true });
      let currentFile = null;
      let busy = false;
      let canceled = false;

      const dropzone = document.getElementById('dropzone');
      const fileInput = document.getElementById('fileInput');
      const selectBtn = document.getElementById('selectBtn');
      const fileNameEl = document.getElementById('fileName');
      const fileSizeEl = document.getElementById('fileSize');
      const info = document.getElementById('info');
      const startBtn = document.getElementById('startBtn');
      const downloadLink = document.getElementById('downloadLink');
      const cancelBtn = document.getElementById('cancelBtn');
      const decodeBar = document.getElementById('decodeBar');
      const encodeBar = document.getElementById('encodeBar');

      function humanSize(bytes){
        const units = ['B','KB','MB','GB'];
        let i=0; while(bytes>=1024 && i<units.length-1){ bytes/=1024; i++; }
        return bytes.toFixed(2) + ' ' + units[i];
      }

      function setProgressBar(el, pct){
        const val = Math.max(0, Math.min(100, Math.round(pct*100)));
        el.style.width = val + '%';
        el.textContent = val + '%';
      }

      dropzone.addEventListener('dragover', (e)=>{ e.preventDefault(); dropzone.classList.add('dragover'); });
      dropzone.addEventListener('dragleave', ()=> dropzone.classList.remove('dragover'));
      dropzone.addEventListener('drop', (e)=>{
        e.preventDefault(); dropzone.classList.remove('dragover');
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if(f) handleFile(f);
      });

      selectBtn.addEventListener('click', ()=> fileInput.click());
      fileInput.addEventListener('change', ()=>{
        const f = fileInput.files && fileInput.files[0]; if(f) handleFile(f);
      });

      function handleFile(file){
        currentFile = file;
        fileNameEl.textContent = file.name;
        fileSizeEl.textContent = humanSize(file.size);
        info.classList.remove('hidden');
        startBtn.disabled = false;
        downloadLink.classList.add('hidden');
      }

      startBtn.addEventListener('click', async ()=>{
        if(!currentFile || busy) return;
        canceled = false;
        busy = true;
        startBtn.disabled = true;
        cancelBtn.classList.remove('hidden');
        decodeBar.style.width = '0%'; encodeBar.style.width = '0%';

        try{
          if(!ffmpeg.isLoaded()){
            // load wasm; this may take a few seconds on first run
            await ffmpeg.load();
          }

          // write file to FS
          ffmpeg.FS('writeFile','input.mp4', await fetchFile(currentFile));

          // First pass: demux audio to WAV (decoding stage)
          ffmpeg.setProgress(({ratio})=>{
            // during this run ratio is only for current command; we map to decoding bar
            setProgressBar(decodeBar, ratio);
          });
          // Run demux: -vn removes video, output wav (PCM) to keep quality
          await ffmpeg.run('-i','input.mp4','-vn','-acodec','pcm_s16le','-ar','44100','-ac','2','output.wav');
          if(canceled) throw new Error('Canceled');

          // Second pass: encode WAV -> MP3 (encoding stage)
          ffmpeg.setProgress(({ratio})=>{
            setProgressBar(encodeBar, ratio);
          });
          // libmp3lame quality option qscale:a 2 => good quality; you can tune it
          await ffmpeg.run('-i','output.wav','-codec:a','libmp3lame','-qscale:a','2','output.mp3');
          if(canceled) throw new Error('Canceled');

          // read the result
          const data = ffmpeg.FS('readFile','output.mp3');
          const blob = new Blob([data.buffer], { type: 'audio/mpeg' });
          const url = URL.createObjectURL(blob);
          downloadLink.href = url;
          downloadLink.download = (currentFile.name.replace(/\.[^/.]+$/, '') || 'output') + '.mp3';
          downloadLink.classList.remove('hidden');
        }catch(err){
          if(err.message && err.message.includes('Canceled')){
            alert('Conversion canceled.');
          }else{
            console.error(err);
            alert('Error during conversion: ' + (err.message||err));
          }
        }finally{
          busy = false;
          startBtn.disabled = false;
          cancelBtn.classList.add('hidden');
          // clean up FS to free memory
          try{ ffmpeg.FS('unlink','input.mp4'); }catch(e){}
          try{ ffmpeg.FS('unlink','output.wav'); }catch(e){}
          try{ ffmpeg.FS('unlink','output.mp3'); }catch(e){}
        }
      });

      cancelBtn.addEventListener('click', ()=>{
        if(!busy) return;
        canceled = true;
        // Note: ffmpeg.wasm currently does not have a graceful cancel API for running command.
        // This sets a flag and user will be informed when next await returns/throws.
        cancelBtn.classList.add('hidden');
      });

    })();
  </script>
