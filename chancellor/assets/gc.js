/* ============================================================================
   GC DOC — the engine behind every form in this folder.

   A form page only has to provide the markup; this wires it up:

     * <img data-art="header">        gets its artwork from artwork.js
     * <input data-field="name">      writes into every <span data-out="name">
     * <input data-day="f-day" data-monthyear="f-monthyear">
                                      typed as "DD/MM/YYYY" (day first, the
                                      order this whole tool uses — never
                                      month first); fills those two fields
                                      as "24th" and "October 2025"
     * <select data-field="type">    a choice field behaves like any other
                                      data-field — read with its current
                                      option's value
     * <p data-show="type:HONORARY"> only shown while the field named
                                      data-field="type" currently holds
                                      "HONORARY"; the rest of the copy
                                      simply flows up to close the gap —
                                      no extra wiring needed
     * <div class="body-copy"><div class="copy">…</div></div>
                                      the copy is scaled down until it fits
     * #pdf / #print / #reset         the three buttons
     * <body data-doc="Honorary Patent" data-file="name,rank">
                                      names the downloaded file

   Every text field and textarea also remembers what was typed into it
   before, per page, in the browser's own storage. A small picker appears
   under a field once it has history, offering past entries to reuse.

   Everything needed to render and export lives in this folder, so the forms
   work with no network connection.
   ========================================================================= */

(function(){
  "use strict";

  var paper   = document.getElementById('paper');
  var scaler  = document.getElementById('scaler');
  var status  = document.getElementById('status');
  var win     = document.querySelector('.body-copy');
  var copy    = document.querySelector('.body-copy .copy');
  var inputs  = [].slice.call(document.querySelectorAll('[data-field]'));
  var dateIn  = document.querySelector('[data-day][data-monthyear]');

  if (!paper) return;

  /* ---------- artwork ---------------------------------------------------- */

  [].forEach.call(document.querySelectorAll('[data-art]'), function(img){
    var key = img.getAttribute('data-art');
    if (window.GC_ART && window.GC_ART[key]) img.src = window.GC_ART[key];
  });

  /* ---------- fields ------------------------------------------------------ */

  var defaults = {};
  inputs.forEach(function(el){ defaults[el.id] = el.value; });
  if (dateIn) defaults[dateIn.id] = dateIn.value;

  function write(el){
    var targets = document.querySelectorAll('[data-out="' + el.getAttribute('data-field') + '"]');
    [].forEach.call(targets, function(t){ t.textContent = el.value.trim(); });
  }

  /* <p data-show="type:HONORARY"> only appears while the field named
     data-field="type" is currently set to "HONORARY"; everything else
     on the patent stays exactly as it is. */
  function applyConditionals(){
    [].forEach.call(document.querySelectorAll('[data-show]'), function(el){
      var parts = el.getAttribute('data-show').split(':');
      var field = document.querySelector('[data-field="' + parts[0] + '"]');
      var value = field ? field.value.trim() : '';
      el.hidden = (value !== parts[1]);
    });
  }

  function render(){
    inputs.forEach(write);
    applyConditionals();
    autofit();
  }

  /* ---------- date -------------------------------------------------------- */

  var MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

  function ordinal(n){
    var rest = n % 100;
    if (rest >= 11 && rest <= 13) return n + 'th';
    switch (n % 10){
      case 1:  return n + 'st';
      case 2:  return n + 'nd';
      case 3:  return n + 'rd';
      default: return n + 'th';
    }
  }

  /* Typed as "DD/MM/YYYY" — day first, throughout this tool — never
     month first. Typing bare digits ("25122026") auto-inserts the two
     slashes as you go. The moment a "/", "-" or "." is typed by hand,
     auto-inserting stands down for the rest of that entry — so a
     deliberate single-digit day or month ("5/3/2027") is never fought
     over mid-edit. Either way the parser below accepts "-" or "." too. */
  function maskDate(el, typedChar){
    if (el.value === '') el._autoMask = true;
    if (typedChar && /[\/\-.]/.test(typedChar)) el._autoMask = false;
    if (el._autoMask === false) return;

    var digits = el.value.replace(/[^\d]/g, '').slice(0, 8);
    var out = digits;
    if (digits.length > 4)      out = digits.slice(0,2) + '/' + digits.slice(2,4) + '/' + digits.slice(4);
    else if (digits.length > 2) out = digits.slice(0,2) + '/' + digits.slice(2);
    el.value = out;
  }

  function fromDate(){
    var m = /^\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\s*$/.exec(dateIn.value);
    if (!m) return;
    var day = parseInt(m[1], 10), month = parseInt(m[2], 10), year = m[3];
    if (day < 1 || day > 31 || month < 1 || month > 12) return;
    var dayEl = document.getElementById(dateIn.getAttribute('data-day'));
    var my    = document.getElementById(dateIn.getAttribute('data-monthyear'));
    if (dayEl) dayEl.value = ordinal(day);
    if (my)    my.value    = MONTHS[month - 1] + ' ' + year;
    render();
  }

  /* ---------- history ------------------------------------------------------ */

  /* Every text field and textarea remembers what was typed into it before,
     per page (localStorage, keyed by the field's id under this page's own
     path — so different forms never mix their history). A small picker
     appears under a field once it has entries to offer. */

  var HISTORY_MAX = 12;

  var historyEls = inputs
    .filter(function(el){ return el.tagName !== 'SELECT'; })
    .concat(dateIn ? [dateIn] : []);

  function historyKey(id){
    return 'gcHistory:' + location.pathname + ':' + id;
  }

  function loadHistory(id){
    try {
      var raw = window.localStorage.getItem(historyKey(id));
      return raw ? JSON.parse(raw) : [];
    } catch (e){ return []; }
  }

  function saveHistory(id, value){
    value = (value || '').trim();
    if (!value) return;
    try {
      var list = loadHistory(id).filter(function(v){ return v !== value; });
      list.unshift(value);
      if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
      window.localStorage.setItem(historyKey(id), JSON.stringify(list));
    } catch (e){ /* storage unavailable — the field still works, it just won't be remembered */ }
  }

  function buildHistoryPicker(el){
    var wrap = el.closest ? el.closest('.field') : null;
    if (!wrap) return;
    var existing = wrap.querySelector('.history-pick');
    if (existing) existing.parentNode.removeChild(existing);

    var list = loadHistory(el.id);
    if (!list.length) return;

    var picker = document.createElement('select');
    picker.className = 'history-pick';
    picker.setAttribute('aria-label', 'Previously used values for this field');

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Use a previous entry…';
    picker.appendChild(placeholder);

    list.forEach(function(v){
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v.length > 64 ? v.slice(0, 61) + '…' : v;
      picker.appendChild(opt);
    });

    picker.addEventListener('change', function(){
      if (!picker.value) return;
      el.value = picker.value;
      picker.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.focus();
    });

    wrap.appendChild(picker);
  }

  function refreshHistoryPickers(){
    historyEls.forEach(buildHistoryPicker);
  }

  /* ---------- fitting ------------------------------------------------------ */

  /* Shrink the copy — as PowerPoint does on overflow — until it sits inside
     the clear window of the sheet, however long the fields run. */
  function autofit(){
    if (!win || !copy) return;
    var k = 1;
    win.style.setProperty('--k', k);
    while (copy.scrollHeight > win.clientHeight && k > 0.55){
      k = Math.round((k - 0.02) * 100) / 100;
      win.style.setProperty('--k', k);
    }
  }

  /* Scale the preview down to whatever room the browser window leaves. */
  function fit(){
    var natural = paper.offsetWidth;
    var room = scaler.parentNode.clientWidth;
    var s = Math.min(1, room / natural);
    paper.style.transform = 'scale(' + s + ')';
    scaler.style.width  = (natural * s) + 'px';
    scaler.style.height = (paper.offsetHeight * s) + 'px';
  }

  /* ---------- export ------------------------------------------------------- */

  function fileName(){
    var parts = (document.body.getAttribute('data-file') || '').split(',');
    var bits = [document.body.getAttribute('data-doc') || 'Document'];
    parts.forEach(function(id){
      var el = document.getElementById(id.trim());
      if (el && el.value.trim()) bits.push(el.value.trim());
    });
    return bits.join(' - ').replace(/[^\w\s.'-]/g, '').replace(/\s+/g, ' ').trim() + '.pdf';
  }

  function imagesReady(){
    var imgs = [].slice.call(paper.querySelectorAll('img'));
    return Promise.all(imgs.map(function(img){
      if (img.complete) return null;
      return new Promise(function(res){ img.onload = img.onerror = res; });
    }));
  }

  var busy = false;

  function downloadPDF(){
    if (busy) return;
    busy = true;
    var btn = document.getElementById('pdf');
    btn.disabled = true;
    if (status) status.textContent = 'Rendering the sheet…';

    var restore = paper.style.transform;

    Promise.resolve()
      .then(function(){ return document.fonts ? document.fonts.ready : null; })
      .then(imagesReady)
      .then(function(){
        if (!window.html2canvas || !window.jspdf){
          throw new Error('the PDF libraries did not load');
        }
        paper.style.transform = 'none';
        scaler.style.width  = paper.offsetWidth + 'px';
        scaler.style.height = paper.offsetHeight + 'px';
        window.scrollTo(0, 0);
        return window.html2canvas(paper, {
          scale: 2.6,                 /* ≈ 250 dpi on an A3 sheet */
          backgroundColor: '#ffffff',
          useCORS: true,
          logging: false,
          width: paper.offsetWidth,
          height: paper.offsetHeight,
          windowWidth: paper.offsetWidth,
          windowHeight: paper.offsetHeight,
          scrollX: 0,
          scrollY: 0
        });
      })
      .then(function(canvas){
        paper.style.transform = restore;
        fit();
        if (status) status.textContent = 'Building the PDF…';

        var pdf = new window.jspdf.jsPDF({
          orientation:'portrait', unit:'mm', format:'a3', compress:true
        });
        var pw = pdf.internal.pageSize.getWidth();    /* 297 mm */
        var ph = pdf.internal.pageSize.getHeight();   /* 420 mm */
        var h  = pw * (canvas.height / canvas.width);
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG',
                     0, (ph - h) / 2, pw, h, undefined, 'FAST');
        pdf.save(fileName());
        if (status) status.textContent = 'Saved ' + fileName();
      })
      .catch(function(err){
        paper.style.transform = restore;
        fit();
        if (status){
          status.textContent = 'PDF export failed (' + err.message +
                               '). Use Print → “Save as PDF” instead.';
        }
      })
      .then(function(){
        busy = false;
        btn.disabled = false;
      });
  }

  /* ---------- wiring -------------------------------------------------------- */

  var form = document.getElementById('form');
  if (form){
    form.addEventListener('input', function(e){
      if (dateIn && e.target === dateIn){ maskDate(dateIn, e.data); fromDate(); }
      else render();
    });
    form.addEventListener('change', function(e){
      if (historyEls.indexOf(e.target) === -1) return;
      saveHistory(e.target.id, e.target.value);
      refreshHistoryPickers();
    });
  }

  var pdfBtn = document.getElementById('pdf');
  if (pdfBtn) pdfBtn.addEventListener('click', downloadPDF);

  var printBtn = document.getElementById('print');
  if (printBtn){
    printBtn.addEventListener('click', function(){
      var restore = paper.style.transform;
      paper.style.transform = 'none';
      window.print();
      paper.style.transform = restore;
      fit();
    });
  }

  var resetBtn = document.getElementById('reset');
  if (resetBtn){
    resetBtn.addEventListener('click', function(){
      Object.keys(defaults).forEach(function(id){
        document.getElementById(id).value = defaults[id];
      });
      render();
      if (status) status.textContent = '';
    });
  }

  window.addEventListener('resize', fit);

  render();
  refreshHistoryPickers();
  fit();
  if (document.fonts && document.fonts.ready){
    document.fonts.ready.then(function(){ render(); fit(); });
  }
})();
