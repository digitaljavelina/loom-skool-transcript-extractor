// Only run once
if (!window.loomTranscriptExtensionLoaded) {
  window.loomTranscriptExtensionLoaded = true;

  // Wait for video player to be ready
  const initTranscriptExtractor = () => {
    console.log('🔍 Loom Transcript Extractor: Waiting for video...');
    
    // Check if video exists
    let checkCount = 0;
    const checkVideo = setInterval(() => {
      checkCount++;
      const video = document.querySelector('video');
      
      if (video) {
        console.log('✅ Video found after', checkCount, 'attempts');
        clearInterval(checkVideo);
        // Wait for tracks to load
        setTimeout(() => {
          console.log('🎬 Creating transcript window...');
          createTranscriptWindow();
        }, 3000); // Give tracks more time to load
      } else if (checkCount % 10 === 0) {
        console.log('⏳ Still waiting for video... attempt', checkCount);
      }
    }, 1000);

    // Give it much longer in embedded context - 60 seconds
    setTimeout(() => {
      clearInterval(checkVideo);
      console.log('❌ Video not found after 60 seconds. Loom embed may not have loaded.');
    }, 60000);
  };

  const parseVTT = (vttText) => {
    const lines = vttText.split('\n');
    const transcript = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip WEBVTT header, timestamps, cue identifiers, and empty lines
      if (line && 
          !line.startsWith('WEBVTT') && 
          !line.includes('-->') && 
          !line.match(/^\d+$/) &&
          !line.startsWith('NOTE')) {
        // Remove any VTT tags like <v Speaker>
        const cleanLine = line.replace(/<[^>]*>/g, '');
        if (cleanLine) {
          transcript.push(cleanLine);
        }
      }
    }
    
    return transcript.join('\n\n');
  };

  const extractVideoId = () => {
    const url = window.location.href;
    console.warn('[LTE] Current URL:', url);

    // Try current page URL (works inside Loom iframe or on loom.com directly)
    const loomPattern = /loom\.com\/(?:share|embed)\/([a-f0-9]+)/i;
    let match = url.match(loomPattern);
    if (match) {
      console.warn('[LTE] Video ID from URL:', match[1]);
      return match[1];
    }

    // Try finding Loom iframe on the page (works on Skool/Notion embeds)
    const iframes = document.querySelectorAll('iframe[src*="loom.com"]');
    console.warn('[LTE] Found', iframes.length, 'Loom iframes');
    for (const iframe of iframes) {
      console.warn('[LTE] iframe src:', iframe.src);
      match = iframe.src.match(loomPattern);
      if (match) return match[1];
    }
    return null;
  };

  const tryFetchJSON = async (url, options = {}) => {
    const resp = await fetch(url, options);
    console.warn('[LTE]', options.method || 'GET', url, '→', resp.status);
    if (!resp.ok) return null;
    return resp.json();
  };

  const fetchFullTranscript = async () => {
    console.warn('[LTE] === fetchFullTranscript starting ===');

    const videoId = extractVideoId();
    if (!videoId) {
      console.error('[LTE] Could not extract video ID');
      throw new Error('Could not determine Loom video ID');
    }
    console.warn('[LTE] Video ID:', videoId);

    // Strategy 1: Try multiple Loom REST API endpoints
    const apiEndpoints = [
      { url: `https://www.loom.com/api/campaigns/sessions/${videoId}/transcriptions`, method: 'GET' },
      { url: `https://www.loom.com/api/campaigns/sessions/${videoId}/transcriptions`, method: 'POST', body: '{}' },
      { url: `https://www.loom.com/api/v1/videos/${videoId}/transcript`, method: 'GET' },
      { url: `https://www.loom.com/api/v1/videos/${videoId}`, method: 'GET' },
      { url: `https://www.loom.com/api/campaigns/sessions/${videoId}`, method: 'GET' },
    ];

    for (const endpoint of apiEndpoints) {
      try {
        const opts = { method: endpoint.method, headers: { 'Content-Type': 'application/json' } };
        if (endpoint.body) opts.body = endpoint.body;
        const data = await tryFetchJSON(endpoint.url, opts);
        if (data) {
          console.warn('[LTE] API response keys:', Object.keys(data));
          const json = JSON.stringify(data);
          // Log a snippet for debugging
          console.warn('[LTE] API snippet:', json.substring(0, 300));

          // Try to extract transcript from response
          if (data.captions) {
            const text = (Array.isArray(data.captions) ? data.captions : []).map(c => c.text || c.value).filter(Boolean).join('\n\n');
            if (text.length > 0) return text;
          }
          if (data.transcript && typeof data.transcript === 'string' && data.transcript.length > 20) return data.transcript;
          if (data.source_url) {
            const vttResp = await fetch(data.source_url);
            if (vttResp.ok) return parseVTT(await vttResp.text());
          }
          // Search for VTT URLs anywhere in the response
          const vttMatch = json.match(/https?:[^"']*\.vtt[^"']*/);
          if (vttMatch) {
            const vttUrl = vttMatch[0].replace(/\\/g, '');
            console.warn('[LTE] Found VTT URL in API response:', vttUrl);
            const vttResp = await fetch(vttUrl);
            if (vttResp.ok) return parseVTT(await vttResp.text());
          }
        }
      } catch (e) {
        console.warn('[LTE] API endpoint failed:', e.message);
      }
    }

    // Strategy 2: Search share page HTML for VTT URLs and embedded data
    try {
      console.warn('[LTE] Strategy 2: Deep HTML search');
      const resp = await fetch(`https://www.loom.com/share/${videoId}`);
      if (resp.ok) {
        const html = await resp.text();

        // Search for VTT URLs
        const vttUrls = html.match(/https?:[^"'\s]*\.vtt[^"'\s]*/g);
        if (vttUrls) {
          console.warn('[LTE] Found VTT URLs in HTML:', vttUrls);
          for (const rawUrl of vttUrls) {
            const url = rawUrl.replace(/\\/g, '');
            try {
              const vttResp = await fetch(url);
              if (vttResp.ok) return parseVTT(await vttResp.text());
            } catch (e) { /* try next */ }
          }
        }

        // Search for any JSON in script tags
        const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
        console.warn('[LTE] Found', scriptMatches.length, 'script tags in share page');
        for (const scriptHtml of scriptMatches) {
          const content = scriptHtml.replace(/<\/?script[^>]*>/gi, '');
          if (content.includes('transcript') || content.includes('caption') || content.includes('.vtt')) {
            console.warn('[LTE] Script with transcript/caption/vtt:', content.substring(0, 300));
            // Try to find VTT URLs in this script
            const innerVtt = content.match(/https?:[^"'\s]*\.vtt[^"'\s]*/g);
            if (innerVtt) {
              for (const rawUrl of innerVtt) {
                const url = rawUrl.replace(/\\/g, '');
                try {
                  const vttResp = await fetch(url);
                  if (vttResp.ok) return parseVTT(await vttResp.text());
                } catch (e) { /* try next */ }
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[LTE] Strategy 2 failed:', e.message);
    }

    // Strategy 3: Try Loom GraphQL API
    try {
      console.warn('[LTE] Strategy 3: GraphQL API');
      const gqlQueries = [
        {
          operationName: 'FetchVideoTranscript',
          variables: { videoId },
          query: `query FetchVideoTranscript($videoId: ID!) { fetchVideoTranscript(videoId: $videoId) { status sentences { text startMs endMs } } }`
        },
        {
          operationName: 'GetTranscript',
          variables: { videoId },
          query: `query GetTranscript($videoId: ID!) { getTranscript(videoId: $videoId) { text captions { text startTime endTime } } }`
        },
        {
          operationName: 'FetchTranscription',
          variables: { videoId },
          query: `query FetchTranscription($videoId: ID!) { fetchTranscription(videoId: $videoId) { ... on TranscriptionSuccess { sourceUrl text } ... on TranscriptionPending { status } } }`
        }
      ];

      for (const query of gqlQueries) {
        try {
          const resp = await fetch('https://www.loom.com/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(query)
          });
          console.warn('[LTE] GraphQL', query.operationName, '→', resp.status);
          if (resp.ok) {
            const result = await resp.json();
            console.warn('[LTE] GraphQL response:', JSON.stringify(result).substring(0, 500));

            // Look for transcript text in the response
            const resultStr = JSON.stringify(result);
            if (result.data) {
              const dataStr = JSON.stringify(result.data);
              // Check for sentences array
              const sentencesMatch = dataStr.match(/"sentences"\s*:\s*(\[[\s\S]*?\])/);
              if (sentencesMatch) {
                try {
                  const sentences = JSON.parse(sentencesMatch[1]);
                  const text = sentences.map(s => s.text).filter(Boolean).join('\n\n');
                  if (text.length > 0) return text;
                } catch(e) { /* continue */ }
              }
              // Check for captions array
              const captionsMatch = dataStr.match(/"captions"\s*:\s*(\[[\s\S]*?\])/);
              if (captionsMatch) {
                try {
                  const captions = JSON.parse(captionsMatch[1]);
                  const text = captions.map(c => c.text).filter(Boolean).join('\n\n');
                  if (text.length > 0) return text;
                } catch(e) { /* continue */ }
              }
              // Check for sourceUrl (VTT)
              const urlMatch = resultStr.match(/"sourceUrl"\s*:\s*"(https?:[^"]+)"/);
              if (urlMatch) {
                const vttResp = await fetch(urlMatch[1]);
                if (vttResp.ok) return parseVTT(await vttResp.text());
              }
              // Check for plain text field
              const textMatch = resultStr.match(/"text"\s*:\s*"([^"]{50,})"/);
              if (textMatch) return textMatch[1];
            }
            // If we got errors, log them for debugging
            if (result.errors) {
              console.warn('[LTE] GraphQL errors:', JSON.stringify(result.errors).substring(0, 300));
            }
          }
        } catch (e) {
          console.warn('[LTE] GraphQL query failed:', e.message);
        }
      }
    } catch (e) {
      console.warn('[LTE] Strategy 3 failed:', e.message);
    }

    // Strategy 4: Inject script into page context to read player data
    try {
      console.warn('[LTE] Strategy 4: Page context injection');
      const pageData = await new Promise((resolve) => {
        const handler = (e) => resolve(e.detail);
        document.addEventListener('lte-page-data', handler, { once: true });

        const script = document.createElement('script');
        script.textContent = `
          (function() {
            try {
              const result = { globals: [] };
              // Search for transcript-related data in window globals
              for (const key of Object.getOwnPropertyNames(window)) {
                try {
                  const val = window[key];
                  if (val && typeof val === 'object' && key.startsWith('__')) {
                    const str = JSON.stringify(val).substring(0, 2000);
                    if (str.includes('transcript') || str.includes('caption') || str.includes('.vtt')) {
                      result.globals.push({ key, snippet: str.substring(0, 500) });
                    }
                  }
                } catch(e) {}
              }
              document.dispatchEvent(new CustomEvent('lte-page-data', { detail: result }));
            } catch(e) {
              document.dispatchEvent(new CustomEvent('lte-page-data', { detail: { error: e.message } }));
            }
          })();
        `;
        document.head.appendChild(script);
        script.remove();
        setTimeout(() => resolve(null), 3000);
      });

      if (pageData) {
        console.warn('[LTE] Page context data:', JSON.stringify(pageData).substring(0, 500));
        if (pageData.globals?.length > 0) {
          for (const g of pageData.globals) {
            console.warn('[LTE] Global', g.key, ':', g.snippet);
            const vttMatch = g.snippet.match(/https?:[^"'\\]*\.vtt[^"'\\]*/);
            if (vttMatch) {
              const vttResp = await fetch(vttMatch[0]);
              if (vttResp.ok) return parseVTT(await vttResp.text());
            }
          }
        }
      } else {
        console.warn('[LTE] Strategy 4: No page data (CSP may have blocked injection)');
      }
    } catch (e) {
      console.warn('[LTE] Strategy 4 failed:', e.message);
    }

    // Strategy 5: Quick TextTrack check
    try {
      const video = document.querySelector('video');
      if (video?.textTracks?.length > 0) {
        for (let i = 0; i < video.textTracks.length; i++) {
          const track = video.textTracks[i];
          track.mode = 'hidden';
          await new Promise(r => setTimeout(r, 1000));
          if (track.cues?.length > 0) {
            const transcript = [];
            for (let j = 0; j < track.cues.length; j++) {
              const text = track.cues[j].text.replace(/<[^>]*>/g, '').trim();
              if (text && !transcript.includes(text)) transcript.push(text);
            }
            return transcript.join('\n\n');
          }
        }
      }
    } catch (e) { /* last resort, ignore */ }

    console.error('[LTE] ❌ All strategies failed');
    throw new Error('Could not fetch transcript from any source');
  };

  const createTranscriptWindow = () => {
    // Create a floating transcript window
    const transcriptWindow = document.createElement('div');
    transcriptWindow.id = 'loom-transcript-extractor';
    transcriptWindow.innerHTML = `
      <div style="position: fixed; top: 20px; right: 20px; width: 450px; max-height: 650px; 
                  background: white; border: 2px solid #6663F6; border-radius: 12px; 
                  box-shadow: 0 8px 32px rgba(0,0,0,0.3); z-index: 999999; 
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
                  display: flex; flex-direction: column;">
        <div id="transcript-header" style="background: linear-gradient(135deg, #6663F6, #97ACFD); 
                    color: white; padding: 15px; border-radius: 10px 10px 0 0; cursor: move; 
                    display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-size: 16px;">📄 Transcript</strong>
          <div>
            <button id="minimizeBtn" style="background: rgba(255,255,255,0.3); border: none; 
                    color: white; padding: 5px 10px; border-radius: 5px; cursor: pointer; 
                    margin-right: 5px; font-weight: bold; font-size: 12px;">−</button>
            <button id="closeBtn" style="background: rgba(255,255,255,0.3); border: none; 
                    color: white; padding: 5px 10px; border-radius: 5px; cursor: pointer; 
                    font-weight: bold; font-size: 12px;">✖</button>
          </div>
        </div>
        <div id="transcript-body" style="flex: 1; display: flex; flex-direction: column;">
          <div style="padding: 12px; background: #f9f9ff; border-bottom: 1px solid #e0e0e0; display: flex; gap: 8px; flex-wrap: wrap;">
            <button id="instantBtn" style="flex: 1; background: #6663F6; color: white; border: none; 
                    padding: 10px 15px; border-radius: 6px; cursor: pointer; font-weight: bold; 
                    font-size: 13px; transition: all 0.2s;">⚡ Get Full Transcript</button>
            <button id="liveBtn" style="flex: 1; background: white; color: #6663F6; border: 2px solid #6663F6; 
                    padding: 10px 15px; border-radius: 6px; cursor: pointer; font-weight: bold; 
                    font-size: 13px; transition: all 0.2s;">🎥 Live Capture</button>
          </div>
          <div style="padding: 10px 12px; background: #fffbea; border-bottom: 1px solid #f0e68c; 
                      font-size: 12px; color: #856404; text-align: center;" id="infoBox">
            Choose a mode to begin
          </div>
          <textarea id="transcriptText" readonly style="flex: 1; padding: 15px; border: none; 
                    font-size: 14px; line-height: 1.6; resize: none; overflow-y: auto; 
                    background: #f8f8f8; color: #333; min-height: 350px; font-family: inherit;"></textarea>
          <div style="padding: 10px; background: #f0f0f0; display: flex; gap: 8px; justify-content: space-between; align-items: center;">
            <div style="font-size: 12px; color: #666;">
              <span id="captionCount">Ready</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button id="copyBtn" disabled style="background: #e0e0e0; border: none; 
                      color: #999; padding: 6px 12px; border-radius: 5px; cursor: not-allowed; 
                      font-weight: bold; font-size: 11px;">📋 Copy</button>
              <button id="downloadBtn" disabled style="background: #e0e0e0; border: none; 
                      color: #999; padding: 6px 12px; border-radius: 5px; cursor: not-allowed; 
                      font-weight: bold; font-size: 11px;">💾 Save</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(transcriptWindow);

    // Make it draggable
    const header = document.getElementById('transcript-header');
    let isDragging = false;
    let currentX, currentY, initialX, initialY;

    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      initialX = e.clientX - transcriptWindow.offsetLeft;
      initialY = e.clientY - transcriptWindow.offsetTop;
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        transcriptWindow.style.left = currentX + 'px';
        transcriptWindow.style.top = currentY + 'px';
        transcriptWindow.style.right = 'auto';
      }
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Elements
    const textArea = document.getElementById('transcriptText');
    const captionCountEl = document.getElementById('captionCount');
    const infoBox = document.getElementById('infoBox');
    const copyBtn = document.getElementById('copyBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const instantBtn = document.getElementById('instantBtn');
    const liveBtn = document.getElementById('liveBtn');
    
    let transcript = [];
    let isMinimized = false;
    let captureInterval = null;
    let currentMode = null;

    const enableButtons = () => {
      copyBtn.disabled = false;
      downloadBtn.disabled = false;
      copyBtn.style.background = '#6663F6';
      copyBtn.style.color = 'white';
      copyBtn.style.cursor = 'pointer';
      downloadBtn.style.background = '#6663F6';
      downloadBtn.style.color = 'white';
      downloadBtn.style.cursor = 'pointer';
    };

    const updateInfo = (message, type = 'info') => {
      const colors = {
        info: { bg: '#fffbea', border: '#f0e68c', text: '#856404' },
        success: { bg: '#d4edda', border: '#c3e6cb', text: '#155724' },
        error: { bg: '#f8d7da', border: '#f5c6cb', text: '#721c24' },
        active: { bg: '#d1ecf1', border: '#bee5eb', text: '#0c5460' }
      };
      const color = colors[type] || colors.info;
      infoBox.style.background = color.bg;
      infoBox.style.borderColor = color.border;
      infoBox.style.color = color.text;
      infoBox.textContent = message;
    };

    // Instant Fetch Mode
    instantBtn.addEventListener('click', async () => {
      if (currentMode === 'instant') return;
      
      // Stop live capture if running
      if (captureInterval) {
        clearInterval(captureInterval);
        captureInterval = null;
      }

      currentMode = 'instant';
      instantBtn.style.background = '#6663F6';
      instantBtn.style.color = 'white';
      liveBtn.style.background = 'white';
      liveBtn.style.color = '#6663F6';
      
      updateInfo('⏳ Fetching full transcript...', 'info');
      captionCountEl.textContent = 'Loading...';

      try {
        const fullTranscript = await fetchFullTranscript();
        transcript = fullTranscript.split('\n\n').filter(line => line.trim());
        textArea.value = fullTranscript;
        captionCountEl.textContent = `${transcript.length} segments • Instant mode`;
        updateInfo('✅ Full transcript loaded instantly!', 'success');
        enableButtons();
      } catch (error) {
        console.error('Error fetching transcript:', error);
        updateInfo('❌ Could not fetch transcript. Try Live Capture mode.', 'error');
        captionCountEl.textContent = 'Error';
      }
    });

    // Live Capture Mode
    liveBtn.addEventListener('click', () => {
      if (currentMode === 'live') return;

      currentMode = 'live';
      transcript = [];
      textArea.value = '';
      liveBtn.style.background = '#6663F6';
      liveBtn.style.color = 'white';
      instantBtn.style.background = 'white';
      instantBtn.style.color = '#6663F6';

      updateInfo('🎥 Capturing captions as video plays...', 'active');
      captionCountEl.textContent = '0 captions • Live mode';
      enableButtons();

      const video = document.querySelector('video');
      const textTracks = video?.textTracks;
      
      if (!textTracks || textTracks.length === 0) {
        updateInfo('❌ No caption tracks available for live capture', 'error');
        return;
      }
      
      // Find and enable caption track
      let captionTrack = null;
      for (let i = 0; i < textTracks.length; i++) {
        const track = textTracks[i];
        if (track.kind === 'captions' || track.kind === 'subtitles') {
          captionTrack = track;
          captionTrack.mode = 'hidden'; // Enable track without showing
          console.log('📺 Live capture enabled for:', track.label);
          break;
        }
      }
      
      if (!captionTrack) {
        updateInfo('❌ No caption tracks found', 'error');
        return;
      }

      captureInterval = setInterval(() => {
        const activeCues = captionTrack.activeCues;
        if (activeCues && activeCues.length > 0) {
          const cue = activeCues[0];
          const text = cue.text.replace(/<[^>]*>/g, '').trim(); // Remove HTML tags
          if (text && !transcript.includes(text)) {
            transcript.push(text);
            textArea.value = transcript.join('\n\n');
            captionCountEl.textContent = `${transcript.length} captions • Live mode`;
            textArea.scrollTop = textArea.scrollHeight;
          }
        }
      }, 500);
    });

    // Copy button
    copyBtn.addEventListener('click', () => {
      if (copyBtn.disabled) return;
      textArea.select();
      navigator.clipboard.writeText(textArea.value).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✅ Copied!';
        setTimeout(() => copyBtn.textContent = originalText, 2000);
      });
    });

    // Download button
    downloadBtn.addEventListener('click', () => {
      if (downloadBtn.disabled) return;
      const videoTitle = document.querySelector('.css-mlocso')?.textContent || 'loom-video';
      const filename = `${videoTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-transcript.txt`;
      
      const blob = new Blob([textArea.value], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      
      const originalText = downloadBtn.textContent;
      downloadBtn.textContent = '✅ Saved!';
      setTimeout(() => downloadBtn.textContent = originalText, 2000);
    });

    // Minimize button
    document.getElementById('minimizeBtn').addEventListener('click', () => {
      const body = document.getElementById('transcript-body');
      const btn = document.getElementById('minimizeBtn');
      if (isMinimized) {
        body.style.display = 'flex';
        btn.textContent = '−';
        isMinimized = false;
      } else {
        body.style.display = 'none';
        btn.textContent = '+';
        isMinimized = true;
      }
    });

    // Close button
    document.getElementById('closeBtn').addEventListener('click', () => {
      if (captureInterval) {
        clearInterval(captureInterval);
      }
      transcriptWindow.remove();
      window.loomTranscriptExtensionLoaded = false;
    });

    console.log('🚀 Loom Transcript Extractor loaded! Choose your mode.');
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTranscriptExtractor);
  } else {
    initTranscriptExtractor();
  }
}