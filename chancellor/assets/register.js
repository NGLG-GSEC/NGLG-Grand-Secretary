/* ============================================================================
   GC REGISTER — the reference numbers of the Chancery ("Our reference N." /
   αριθμός πρωτοκόλλου) and the archive of everything produced (Αρχείο
   Απονομών).

   One shared register, kept as a single JSON file in the private data
   repository (the same one the Grand Secretary app uses):

       chancellor/register.json   { "start": 1201, "records": [ … ] }

   A number is the highest one so far + 1 (the first is 1201) and is written
   with GitHub's own compare-and-swap (the file's sha) — if someone else
   saved at the same moment the write is refused and retried, so two people
   can never be given the same number.

   Each record holds: ref, form (page), doc, type, rank, name, date, file
   (the PDF's name), the filled-in fields (for the preview) and when it was
   produced.

   The connection (repository + token) is entered once per browser and is
   kept in that browser's storage. If the Grand Secretary app on this site is
   already connected with a token, that connection is used.
   ========================================================================= */

(function(){
  "use strict";

  var START = 1201;
  var PATH = 'chancellor/register.json';
  var KEY = 'gc-register-conn';
  var DEFAULT_REPO = 'NGLG-GSEC/nglg-grammateia-data';
  var API = 'https://api.github.com';

  function store(){ try { return window.localStorage; } catch (e) { return null; } }

  function conn(){
    var s = store(), c = null;
    if (!s) return null;
    try { c = JSON.parse(s.getItem(KEY) || 'null'); } catch (e) {}
    if (c && c.token) return c;
    try {
      var m = JSON.parse(s.getItem('nglg-connection') || 'null');
      if (m && m.kind === 'github' && m.token) return { repo: m.repo || DEFAULT_REPO, token: m.token };
    } catch (e) {}
    return null;
  }
  function setConn(c){
    var s = store(); if (!s) return;
    if (c) s.setItem(KEY, JSON.stringify(c)); else s.removeItem(KEY);
  }

  function b64enc(text){ return btoa(unescape(encodeURIComponent(text))); }
  function b64dec(b64){ return decodeURIComponent(escape(atob(b64.replace(/\s/g, '')))); }

  function request(method, body){
    var c = conn();
    if (!c) return Promise.reject(new Error('Not connected to the register.'));
    return fetch(API + '/repos/' + c.repo + '/contents/' + PATH + (method === 'GET' ? '' : ''), {
      method: method,
      cache: 'no-store',
      headers: Object.assign({
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + c.token,
        'X-GitHub-Api-Version': '2022-11-28'
      }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
  }

  function explain(res){
    if (res.status === 401) return 'The GitHub token is not valid or has expired.';
    if (res.status === 403) return 'The GitHub token may not write to the register (it needs Contents: Read and write).';
    if (res.status === 404) return 'The data repository was not found, or the token has no access to it.';
    return 'GitHub answered ' + res.status + '.';
  }

  /* -> { data: {start, records}, sha } (a missing file is an empty register) */
  function load(){
    return request('GET').then(function(res){
      if (res.status === 404){
        /* distinguish "no file yet" from "no repository / no access" */
        var c = conn();
        return fetch(API + '/repos/' + c.repo, { cache: 'no-store', headers: {
          'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + c.token } })
          .then(function(r){
            if (!r.ok) throw new Error(explain(r));
            return { data: { start: START, records: [] }, sha: null };
          });
      }
      if (!res.ok) throw new Error(explain(res));
      return res.json().then(function(j){
        var data = JSON.parse(b64dec(j.content));
        if (!data.records) data.records = [];
        return { data: data, sha: j.sha };
      });
    });
  }

  function write(data, sha, message){
    var body = { message: message, content: b64enc(JSON.stringify(data, null, 1) + '\n') };
    if (sha) body.sha = sha;
    return request('PUT', body);
  }

  function nextRef(records){
    var top = START - 1;
    records.forEach(function(r){ if (r.ref > top) top = r.ref; });
    return top + 1;
  }

  /* Gives the document its number. The same document (same form, same
     fields) always keeps the number it already has. */
  function assign(record){
    var sig = JSON.stringify([record.form, record.fields]);
    function attempt(n){
      return load().then(function(st){
        var same = st.data.records.filter(function(r){ return r.sig === sig; })[0];
        if (same) return same;
        var ref = nextRef(st.data.records);
        var rec = Object.assign({}, record, { ref: ref, sig: sig, created: new Date().toISOString() });
        rec.file = ref + ' - ' + record.fileTail + '.pdf';
        delete rec.fileTail;
        st.data.start = START;
        st.data.records.push(rec);
        return write(st.data, st.sha, 'Chancery reference ' + ref + ' — ' + record.doc).then(function(res){
          if (res.ok) return rec;
          if ((res.status === 409 || res.status === 422) && n < 6) return attempt(n + 1);   /* someone saved first */
          throw new Error(explain(res));
        });
      });
    }
    return attempt(0);
  }

  function find(ref){
    return load().then(function(st){
      return st.data.records.filter(function(r){ return String(r.ref) === String(ref); })[0] || null;
    });
  }

  /* ---------- the connection panel ------------------------------------------ */

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }

  /* Fills <div id="register-panel"> with the state of the connection and, when
     there is none, the little form to make it. `onChange` runs after a
     connection is made or removed. */
  function panel(el, onChange){
    if (!el) return;
    function draw(){
      var c = conn();
      if (c){
        el.innerHTML = '<p class="reg-state ok">Register connected — <b>' + esc(c.repo) + '</b> ' +
          '<button type="button" class="linkbtn" data-act="off">Disconnect</button></p>';
        el.querySelector('[data-act=off]').onclick = function(){ setConn(null); draw(); if (onChange) onChange(); };
        return;
      }
      el.innerHTML =
        '<p class="reg-state">The reference numbers are kept in a shared register. Connect once in this browser:</p>' +
        '<div class="field"><label for="reg-repo">Data repository</label>' +
        '<input id="reg-repo" type="text" value="' + esc(DEFAULT_REPO) + '"></div>' +
        '<div class="field"><label for="reg-token">GitHub token <i>— Contents: Read and write</i></label>' +
        '<input id="reg-token" type="password" autocomplete="off" placeholder="github_pat_…"></div>' +
        '<button type="button" class="btn" data-act="on">Connect</button> ' +
        '<a class="linkbtn" target="_blank" rel="noopener" href="https://github.com/settings/tokens/new?scopes=repo&description=Grand%20Chancellor%20register">Create a token</a>' +
        '<p class="reg-err" role="alert"></p>';
      el.querySelector('[data-act=on]').onclick = function(){
        var repo = el.querySelector('#reg-repo').value.trim(), token = el.querySelector('#reg-token').value.trim();
        var err = el.querySelector('.reg-err');
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token){ err.textContent = 'Enter the repository (owner/name) and the token.'; return; }
        setConn({ repo: repo, token: token });
        err.textContent = 'Checking…';
        load().then(function(){ draw(); if (onChange) onChange(); })
          .catch(function(e){ setConn(null); err.textContent = e.message; });
      };
    }
    draw();
  }

  window.GC_REG = {
    START: START, conn: conn, load: load, assign: assign, find: find, panel: panel,
    connected: function(){ return !!conn(); }
  };
})();
