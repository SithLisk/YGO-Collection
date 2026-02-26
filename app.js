// Global shims so inline onclick attrs work before window.onload fires
function showProfileScreen() { if (window._showProfileScreen) window._showProfileScreen(); }
function toggleAuth()        { if (window._toggleAuth)        window._toggleAuth();        }

window.onload = function() {

  // Firebase init
  firebase.initializeApp({
    apiKey: "AIzaSyCbb51QGCVq7N_cmTifYYJb8Eb_YiqkVg4",
    authDomain: "ygo-collection-4c76d.firebaseapp.com",
    projectId: "ygo-collection-4c76d",
    storageBucket: "ygo-collection-4c76d.firebasestorage.app",
    messagingSenderId: "725120094141",
    appId: "1:725120094141:web:ba9d638ce4c1a20d04ccd4"
  });
  var db = firebase.firestore();

  // Active profile state
  var activeProfileId = localStorage.getItem('activeProfileId') || null;
  var activeProfileName = localStorage.getItem('activeProfileName') || null;
  var col = null;
  var cardsUnsub = null;
  var decksUnsub = null;

  var selCard = null;
  var cards = [];
  var timer = null;
  var acIdx = -1;

  var inp = document.getElementById('cardSearch');
  var acList = document.getElementById('acList');
  var statusEl = document.getElementById('statusMsg');

  // Sync state
  function sync(state, msg) {
    var dot = document.getElementById('syncDot');
    var lbl = document.getElementById('syncLabel');
    dot.className = 'sync-dot ' + state;
    lbl.className = state;
    lbl.textContent = msg;
  }

  // Profile-scoped Firestore listener
  function startProfileListener(profileId) {
    if (cardsUnsub) { cardsUnsub(); cardsUnsub = null; }
    col = db.collection('profiles').doc(profileId).collection('cards');
    sync('syncing', 'Connecting...');
    cardsUnsub = col.orderBy('addedAt','asc').onSnapshot(function(snap) {
      cards = snap.docs.map(function(d) { var o = d.data(); o.fid = d.id; return o; });
      renderTable();
    sync('synced', 'Synced ' + new Date().toLocaleTimeString());
  }, function(err) {
    sync('error', 'Error: ' + err.code);
    renderTable();
  });
  } // end startProfileListener

  // Search input
  inp.addEventListener('input', function() {
    clearTimeout(timer);
    var q = inp.value.trim();
    if (q.length === 0) { closeAc(); clearPreview(); return; }
    if (q.length < 4) { closeAc(); return; }
    timer = setTimeout(function() { doSearch(q); }, 700);
  });

  function clearPreview() {
    selCard = null;
    document.getElementById('cardPreview').classList.remove('open');
    document.getElementById('entryForm').classList.remove('open');
    document.getElementById('previewName').textContent = '';
    document.getElementById('previewMeta').innerHTML = '';
    document.getElementById('previewAtkDef').innerHTML = '';
    document.getElementById('previewEffect').textContent = '';
    document.getElementById('previewSet').textContent = '';
    document.getElementById('cardImgWrap').innerHTML = '<div class="img-ph">&#x1F0A3;</div>';
    document.getElementById('cardNumField').style.display = 'none';
    document.getElementById('fCardNum').innerHTML = '';
    statusEl.textContent = '';
  }

  inp.addEventListener('keydown', function(e) {
    var items = acList.querySelectorAll('.ac-item');
    if (e.key === 'ArrowDown') { acIdx = Math.min(acIdx+1, items.length-1); hiAc(items); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { acIdx = Math.max(acIdx-1, 0); hiAc(items); e.preventDefault(); }
    else if (e.key === 'Enter' && acIdx >= 0 && items[acIdx]) { items[acIdx].click(); e.preventDefault(); }
    else if (e.key === 'Escape') closeAc();
  });

  document.addEventListener('click', function(e) { if (!e.target.closest('.search-wrap')) closeAc(); });

  function normalize(q) {
    return q
      .trim()
      // Remove characters the API doesn't accept
      .replace(/[^a-zA-Z0-9 '\-]/g, '')
      // Collapse multiple spaces
      .replace(/  +/g, ' ')
      // Title-case each word so "blue eyes" -> "Blue Eyes"
      .replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  }

  function doSearch(q) {
    var base = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';

    // Build a set of query variants to try in order:
    // 1. Input as-is (normalized + title-cased)
    // 2. Spaces replaced with hyphens  "Blue Eyes" -> "Blue-Eyes"
    // 3. Hyphens replaced with spaces  "Blue-Eyes" -> "Blue Eyes"
    // 4. First word only               "Blue-Eyes White Dragon" -> "Blue-Eyes"
    var norm      = normalize(q);
    if (norm.length < 4) return;

    var hyphenated = norm.replace(/ /g, '-');
    var spaced     = norm.replace(/-/g, ' ');
    var firstWord  = norm.split(/[ -]/)[0];

    // Deduplicate variants while preserving order
    var seen = {};
    var variants = [norm, hyphenated, spaced, firstWord].filter(function(v) {
      if (v.length < 4 || seen[v]) return false;
      seen[v] = true; return true;
    });

    statusEl.innerHTML = '<span class="spinner"></span>';

    function handleData(data) {
      statusEl.textContent = '';
      if (!data || data.error || !data.data || !data.data.length) {
        closeAc(); statusEl.textContent = 'No cards found'; return;
      }
      openAc(data.data.slice(0, 10));
    }

    // Try each variant in sequence, stopping at the first success
    // Also try archetype search — handles "Blue-Eyes", "Dark Magician" etc.
    // which are archetypes with hundreds of variants that break fname
    var archetypeGuess = norm.replace(/-/g, ' ');

    function tryFetch(url) {
      return fetch(url).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; });
    }

    function hasResults(d) { return d && d.data && d.data.length > 0; }

    function tryVariant(idx) {
      if (idx >= variants.length) {
        // All fname variants exhausted — try archetype as last resort
        tryFetch(base + '?archetype=' + encodeURIComponent(archetypeGuess) + '&num=10&offset=0')
          .then(function(d) {
            if (hasResults(d)) { handleData(d); return; }
            // Final fallback: first word as archetype
            var fw = archetypeGuess.split(' ')[0];
            if (fw.length >= 3) {
              return tryFetch(base + '?archetype=' + encodeURIComponent(fw) + '&num=10&offset=0')
                .then(function(d2) {
                  if (hasResults(d2)) { handleData(d2); return; }
                  statusEl.textContent = 'No cards found'; closeAc();
                });
            }
            statusEl.textContent = 'No cards found'; closeAc();
          });
        return;
      }
      var v = variants[idx];
      tryFetch(base + '?fname=' + encodeURIComponent(v) + '&num=10&offset=0')
        .then(function(d) {
          if (hasResults(d)) { handleData(d); return; }
          tryVariant(idx + 1);
        });
    }

    tryVariant(0);
  }

  function openAc(results) {
    acIdx = -1; acList.innerHTML = '';
    results.forEach(function(card) {
      var item = document.createElement('div');
      item.className = 'ac-item';
      var tl = tLabel(card.type);
      item.innerHTML = '<span>' + esc(card.name) + '</span><span class="tbadge ' + tl.c + '">' + tl.t + '</span>';
      item.addEventListener('click', function() { pickCard(card); });
      acList.appendChild(item);
    });
    acList.classList.add('open');
  }

  function hiAc(items) {
    items.forEach(function(it,i) { it.classList.toggle('hi', i===acIdx); });
    if (items[acIdx]) items[acIdx].scrollIntoView({block:'nearest'});
  }

  function closeAc() { acList.classList.remove('open'); acList.innerHTML = ''; acIdx = -1; }

  function pickCard(card) {
    selCard = card;
    inp.value = card.name;
    closeAc();
    statusEl.textContent = '';
    showPreview(card);
  }

  function showPreview(card) {
    document.getElementById('cardPreview').classList.add('open');
    document.getElementById('entryForm').classList.add('open');
    document.getElementById('previewName').textContent = card.name;

    var tl = tLabel(card.type);
    var pc = tl.c === 'bs' ? 'ps' : tl.c === 'bt' ? 'pt' : 'pm';
    var mh = '<span class="mpill ' + pc + '">' + esc(card.type) + '</span>';
    if (card.archetype) mh += '<span class="mpill pa">' + esc(card.archetype) + '</span>';
    document.getElementById('previewMeta').innerHTML = mh;

    var ad = document.getElementById('previewAtkDef');
    if (card.atk !== undefined) {
      ad.innerHTML = 'ATK <b>' + (card.atk===-1?'?':card.atk) + '</b> / DEF <b>' + (card.def===undefined?'?':card.def===-1?'?':card.def) + '</b>';
    } else { ad.innerHTML = ''; }

    document.getElementById('previewEffect').textContent = card.desc || '';

    var se = document.getElementById('previewSet');
    if (card.card_sets && card.card_sets.length) {
      var s = card.card_sets[0];
      se.innerHTML = '<strong>' + esc(s.set_name) + '</strong> &middot; ' + esc(s.set_code) + ' &middot; ' + esc(s.set_rarity);

      // Populate card number dropdown with all printings
      var cnField = document.getElementById('cardNumField');
      var cnSelect = document.getElementById('fCardNum');
      cnSelect.innerHTML = '';
      card.card_sets.forEach(function(cs) {
        var opt = document.createElement('option');
        opt.value = cs.set_code;
        opt.textContent = cs.set_code + ' — ' + cs.set_name + ' (' + cs.set_rarity + ')';
        opt.dataset.rarity  = cs.set_rarity;
        opt.dataset.setName = cs.set_name;
        opt.dataset.setCode = cs.set_code;
        cnSelect.appendChild(opt);
      });
      cnField.style.display = '';

      // Auto-update Rarity and Set preview when card number changes
      cnSelect.onchange = function() {
        var sel = cnSelect.options[cnSelect.selectedIndex];
        se.innerHTML = '<strong>' + esc(sel.dataset.setName) + '</strong> &middot; ' + esc(sel.dataset.setCode) + ' &middot; ' + esc(sel.dataset.rarity);
        var opts = document.getElementById('fRarity').options;
        for (var i=0; i<opts.length; i++) { if (opts[i].value===sel.dataset.rarity) { document.getElementById('fRarity').selectedIndex=i; break; } }
      };

      // Set initial rarity from first printing
      var opts = document.getElementById('fRarity').options;
      for (var i=0; i<opts.length; i++) { if (opts[i].value===s.set_rarity) { document.getElementById('fRarity').selectedIndex=i; break; } }
    } else {
      se.textContent = 'No set info';
      document.getElementById('cardNumField').style.display = 'none';
    }



    var wrap = document.getElementById('cardImgWrap');
    if (card.card_images && card.card_images.length) {
      var img = document.createElement('img');
      img.src = 'https://images.ygoprodeck.com/images/cards_small/' + card.card_images[0].id + '.jpg';
      img.alt = card.name;
      img.onerror = function() { wrap.innerHTML = '<div class="img-ph">&#x1F0A3;</div>'; };
      wrap.innerHTML = '';
      wrap.appendChild(img);
    } else { wrap.innerHTML = '<div class="img-ph">&#x1F0A3;</div>'; }
  }

  // Auth state
  var PW_HASH = '663dc2bedc7eb3349bc80bff0c508111936a2a0d18269353a7ef7020ae24cc18';
  var authed = false;
  var sortCol = null;
  var sortDir = 1;
  var collFilter = '';
  var collTypeFilter = '';

  function sha256(str) {
    // Use SubtleCrypto to hash the password
    var buf = new TextEncoder().encode(str);
    return crypto.subtle.digest('SHA-256', buf).then(function(hash) {
      return Array.from(new Uint8Array(hash)).map(function(b) { return b.toString(16).padStart(2,'0'); }).join('');
    });
  }

  window._toggleAuth = window.toggleAuth = function() {
    if (authed) {
      authed = false;
      updateLockBtn();
      toast('Locked');
    } else {
      document.getElementById('pwModal').style.display = 'flex';
      setTimeout(function() { document.getElementById('pwInput').focus(); }, 50);
    }
  };

  window.closePwModal = function() {
    document.getElementById('pwModal').style.display = 'none';
    document.getElementById('pwInput').value = '';
    document.getElementById('pwError').textContent = '';
  };

  window.submitPw = function() {
    var val = document.getElementById('pwInput').value;
    sha256(val).then(function(hash) {
      if (hash === PW_HASH) {
        authed = true;
        closePwModal();
        updateLockBtn();
        toast('Unlocked — you can now edit your collection');
      } else {
        document.getElementById('pwError').textContent = 'Incorrect password';
        document.getElementById('pwInput').value = '';
      }
    });
  };

  function updateLockBtn() {
    var btn = document.getElementById('lockBtn');
    if (authed) {
      btn.innerHTML = '&#x1F513; Unlocked';
      btn.style.color = '#4ade80';
      btn.style.borderColor = 'rgba(74,222,128,0.4)';
    } else {
      btn.innerHTML = '&#x1F512; Locked';
      btn.style.color = 'var(--gold-pale)';
      btn.style.borderColor = 'rgba(160,30,30,0.5)';
    }
  }

  function requireAuth(action) {
    if (authed) { action(); return; }
    document.getElementById('pwModal').style.display = 'flex';
    setTimeout(function() { document.getElementById('pwInput').focus(); }, 50);
  }

  // Add card
  window.addToCollection = function() {
    requireAuth(function() { doAdd(); });
  };
  function doAdd() {
    if (!selCard) return;
    var c = selCard;
    var fs = (c.card_sets && c.card_sets.length) ? c.card_sets[0] : {};
    sync('syncing','Saving...');
    col.add({
      name: c.name, type: c.type, race: c.race||'—', level: c.level||c.linkval||null,
      cardImageId: (c.card_images && c.card_images.length ? c.card_images[0].id : null),
      attribute: c.attribute||'—',
      archetype: c.archetype||'—',
      atk: c.atk!==undefined ? (c.atk===-1?'?':String(c.atk)) : '—',
      def: c.def!==undefined ? (c.def===-1?'?':String(c.def)) : '—',
      setName: (function(){ var s=document.getElementById('fCardNum'); return s && s.selectedIndex>=0 ? s.options[s.selectedIndex].dataset.setName : (fs.set_name||'—'); })(),
      setCode: (function(){ var s=document.getElementById('fCardNum'); return s && s.selectedIndex>=0 ? s.options[s.selectedIndex].dataset.setCode : (fs.set_code||'—'); })(),
      cardNumber: (function(){ var s=document.getElementById('fCardNum'); return s && s.selectedIndex>=0 ? s.value : (fs.set_code||'—'); })(),
      rarity: document.getElementById('fRarity').value,
      condition: document.getElementById('fCondition').value,
      edition: document.getElementById('fEdition').value,
      qty: parseInt(document.getElementById('fQty').value)||1,
      price: 0,
      notes: '',
      addedAt: Date.now()
    }).then(function() {
      toast(c.name + ' added!');
      document.getElementById('fQty').value = 1;
    }).catch(function(e) { sync('error','Save failed'); toast('Save failed: ' + e.message); });
  }

  // Remove card
  window.removeEntry = function(id) {
    requireAuth(function() {
      // Find card data before deleting for undo
      var card = cards.find(function(c){ return c.fid === id; });
      sync('syncing','Removing...');
      col.doc(id).delete().then(function() {
        if (!card) return;
        // Show undo toast
        var t = document.getElementById('toast');
        var t = document.getElementById('toast');
        t.innerHTML = '';
        var msg = document.createTextNode(card.name + ' removed  ');
        var undoBtn = document.createElement('button');
        undoBtn.textContent = 'UNDO';
        undoBtn.style.cssText = 'font-family:Cinzel,serif;font-size:10px;letter-spacing:1px;background:rgba(240,192,64,0.2);color:#f0c040;border:1px solid rgba(240,192,64,0.4);border-radius:4px;padding:3px 10px;cursor:pointer;margin-left:4px';
        undoBtn.onclick = function(){ undoDelete(); };
        t.appendChild(msg);
        t.appendChild(undoBtn);
        t.classList.add('show');
        clearTimeout(window._toastTimer);
        window._undoCard = card;
        window._toastTimer = setTimeout(function(){
          t.classList.remove('show');
          window._undoCard = null;
        }, 5000);
      }).catch(function(e) { sync('error','Delete failed'); });
    });
  };

  window.undoDelete = function() {
    if (!window._undoCard) return;
    var card = window._undoCard;
    window._undoCard = null;
    clearTimeout(window._toastTimer);
    document.getElementById('toast').classList.remove('show');
    delete card.fid;
    col.add(card).catch(function(e){ toast('Undo failed: ' + e.message); });
  };

  // Collection type dropdown
  window.toggleCollDropdown = function() {
    var dd = document.getElementById('collDropdown');
    dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
  };

  window.setCollTypeFilter = function(type) {
    collTypeFilter = type;
    // Update active state on options
    document.querySelectorAll('.coll-filter-opt').forEach(function(el) {
      el.classList.remove('active');
      var txt = el.textContent.trim().toLowerCase();
      if ((type === '' && txt === 'all cards') ||
          (type === 'monster' && txt.indexOf('monster') !== -1) ||
          (type === 'spell'   && txt.indexOf('spell')   !== -1) ||
          (type === 'trap'    && txt.indexOf('trap')    !== -1)) {
        el.classList.add('active');
      }
    });
    // Update label next to title
    var labels = { '': '', 'monster': '— Monsters', 'spell': '— Spells', 'trap': '— Traps' };
    document.getElementById('collFilterLabel').textContent = labels[type] || '';
    document.getElementById('collDropdown').style.display = 'none';
    renderTable();
  };

  // Close dropdown when clicking outside
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#collFilterBtn') && !e.target.closest('#collDropdown')) {
      var dd = document.getElementById('collDropdown');
      if (dd) dd.style.display = 'none';
    }
  });

  // Collection filter
  window.filterCollection = function() {
    var inp = document.getElementById('collSearch');
    collFilter = inp.value.trim().toLowerCase();
    document.getElementById('collClear').style.display = collFilter ? 'inline' : 'none';
    renderTable();
  };

  window.clearCollSearch = function() {
    document.getElementById('collSearch').value = '';
    collFilter = '';
    document.getElementById('collClear').style.display = 'none';
    renderTable();
  };

  // Sort
  window.sortBy = function(col) {
    if (sortCol === col) {
      sortDir *= -1;
    } else {
      sortCol = col;
      sortDir = 1;
    }
    // Update sort icons
    document.querySelectorAll('.sort-icon').forEach(function(el) { el.className = 'sort-icon'; });
    var icon = document.getElementById('si-' + col);
    if (icon) icon.className = 'sort-icon ' + (sortDir === 1 ? 'asc' : 'desc');
    renderTable();
  };

  function getTypeDisplay(e) {
    var t = (e.type||'').toLowerCase();
    if (t.indexOf('spell') !== -1) return 'Spell';
    if (t.indexOf('trap')  !== -1) return 'Trap';
    return e.race || '—';
  }

  function getSortValue(e, col) {
    if (col === 'total') return (e.qty || 0) * (e.price || 0);
    if (col === 'qty')   return e.qty || 0;
    if (col === 'price') return e.price || 0;
    if (col === 'atk')   return isNaN(Number(e.atk)) ? -1 : Number(e.atk);
    if (col === 'level') return Number(e.level) || 0;
    if (col === 'type')  return getTypeDisplay(e).toLowerCase();
    return String(e[col] || '').toLowerCase();
  }

  function filteredCards() {
    var base = cards;
    // Type filter (Monsters / Spells / Traps)
    if (collTypeFilter) {
      base = base.filter(function(e) {
        var t = (e.type||'').toLowerCase();
        if (collTypeFilter === 'monster') return t.indexOf('spell') === -1 && t.indexOf('trap') === -1;
        return t.indexOf(collTypeFilter) !== -1;
      });
    }
    // Text search filter
    if (!collFilter) return base;
    return base.filter(function(e) {
      return [e.name, e.type, e.race, e.attribute, e.archetype, e.setName, e.cardNumber, e.rarity, e.condition, e.edition]
        .some(function(v) { return String(v||'').toLowerCase().indexOf(collFilter) !== -1; });
    });
  }

  function sortedCards() {
    var base = filteredCards();
    if (!sortCol) return base;
    return base.slice().sort(function(a, b) {
      var av = getSortValue(a, sortCol);
      var bv = getSortValue(b, sortCol);
      if (av < bv) return -1 * sortDir;
      if (av > bv) return  1 * sortDir;
      return 0;
    });
  }

  // Render table
  function renderTable() {
    var tbody = document.getElementById('collBody');
    if (!cards.length) {
      tbody.innerHTML = '<tr><td colspan="13"><div class="empty-st"><div class="empty-ic">&#9876;</div><p class="empty-tx">Your collection awaits</p></div></td></tr>';
      updateStats(); return;
    }
    var h = '';
    sortedCards().forEach(function(e) {
      var tl = tLabel(e.type);
      var dc = dotClass(e.type);
      var tot = (e.qty||0)*(e.price||0);
      h += '<tr>';
      var nameClick = 'openCardModal(' + JSON.stringify(e.name) + ')';
      var imgId = e.cardImageId || '';
      var thumbSrc = imgId ? 'https://images.ygoprodeck.com/images/cards_small/' + imgId + '.jpg' : '';
      h += '<td class="td-thumb">' + (thumbSrc ? '<img src="' + thumbSrc + '" alt="" class="thumb-img" onclick="' + esc(nameClick) + '">' : '') + '</td>';
      h += '<td class="td-nm"><span class="dot ' + dc + '"></span><span class="card-link" onclick="' + esc(nameClick) + '">' + esc(e.name) + '</span></td>';
      h += '<td class="td-sm">' + esc(getTypeDisplay(e)) + '</td>';
      h += '<td class="td-sm">' + attrBadge(e.attribute) + '</td>';
      h += '<td class="td-sm">' + esc(e.archetype) + '</td>';
      h += '<td class="td-atk">' + (e.atk!=='—' ? e.atk+' / '+e.def : '—') + '</td>';
      h += '<td class="td-sm">' + esc(e.cardNumber||e.setCode||'—') + '</td>';
      var t2 = (e.type||'').toLowerCase();
      var isMonster = t2.indexOf('spell') === -1 && t2.indexOf('trap') === -1;
      var lvlDisplay = '';
      if (isMonster && e.level) {
        var pfx = t2.indexOf('xyz') !== -1 ? 'R' : t2.indexOf('link') !== -1 ? 'Link' : 'L';
        lvlDisplay = pfx + '-' + e.level;
      }
      h += '<td class="td-sm" style="text-align:center;font-family:Cinzel,serif;font-size:11px;color:var(--gold-pale)">' + lvlDisplay + '</td>';
      h += '<td class="rtxt ' + rClass(e.rarity) + '">' + esc(e.rarity) + '</td>';
      h += '<td><span class="cb ' + cClass(e.condition) + '">' + esc(e.condition) + '</span></td>';
      h += '<td class="td-sm">' + esc(e.edition) + '</td>';
      h += '<td style="padding:4px 8px"><div class="qty-ctrl"><button class="qty-btn" data-fid="'+e.fid+'" data-delta="-1">&#8722;</button><span class="qty-val">'+(e.qty||0)+'</span><button class="qty-btn" data-fid="'+e.fid+'" data-delta="1">+</button></div></td>';
      h += '<td><button class="btn-del" onclick="removeEntry(\'' + e.fid + '\')">X</button></td>';
      h += '</tr>';
    });
    tbody.innerHTML = h;
    updateStats();
  }

  // Qty button delegation on collection table
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.qty-btn');
    if (!btn) return;
    var fid = btn.dataset.fid;
    var delta = parseInt(btn.dataset.delta);
    if (fid && delta) adjustQty(fid, delta);
  });

  function updateStats() {
    var visible = filteredCards();
    document.getElementById('statUnique').textContent = collFilter
      ? visible.length + ' / ' + cards.length
      : cards.length;
    document.getElementById('statTotal').textContent = visible.reduce(function(s,e){return s+(e.qty||0);},0);
    // Rarity breakdown
    var rarOrder = ['Secret Rare','Prismatic Secret Rare','Starlight Rare','Quarter Century Secret Rare','Ghost Rare','Ultra Rare','Super Rare','Rare','Common'];
    var rarColors = {'Secret Rare':'#e879f9','Prismatic Secret Rare':'#f0abfc','Starlight Rare':'#fde68a','Quarter Century Secret Rare':'#fcd34d','Ghost Rare':'#e2e8f0','Ultra Rare':'#fcd34d','Super Rare':'#c4b5fd','Rare':'#93c5fd','Common':'#6b5f7a'};
    var counts = {};
    cards.forEach(function(e){
      var r = e.rarity || 'Common';
      counts[r] = (counts[r]||0) + (e.qty||1);
    });
    var html = '<span style="font-family:Cinzel,serif;font-size:9px;letter-spacing:2px;color:var(--silver-dim);text-transform:uppercase;margin-right:4px">Rarities:</span>';
    rarOrder.forEach(function(r){
      if (!counts[r]) return;
      var c = rarColors[r] || 'var(--silver)';
      html += '<span class="rar-stat"><span class="rar-stat-n" style="color:'+c+'">'+counts[r]+'</span><span style="color:var(--silver-dim);font-size:9px">'+r+'</span></span>';
    });
    // Any unlisted rarities
    Object.keys(counts).forEach(function(r){
      if (rarOrder.indexOf(r) === -1) html += '<span class="rar-stat"><span class="rar-stat-n" style="color:var(--silver)">'+counts[r]+'</span><span style="color:var(--silver-dim);font-size:9px">'+r+'</span></span>';
    });
    document.getElementById('rarityBreakdown').innerHTML = html;
  }

  // Export
  window.exportCSV = function() {
    if (!cards.length) { toast('Nothing to export!'); return; }
    var h = ['Card Name','Type','Attribute','Archetype','ATK','DEF','Set Name','Card Number','Rarity','Edition','Condition','Qty','Total','Notes'].join(',');
    var rows = cards.map(function(e) {
      return [e.name,e.type,e.attribute||'—',e.archetype,e.atk,e.def,e.setName,e.cardNumber||e.setCode||'—',e.rarity,e.edition,e.condition,e.qty,((e.qty||0)*(e.price||0)).toFixed(2),e.notes]
        .map(function(v){return '"'+String(v||'').replace(/"/g,'""')+'"';}).join(',');
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([[h].concat(rows).join('\r\n')],{type:'text/csv'}));
    a.download = 'yugioh_collection.csv'; a.click();
    toast('CSV exported!');
  };

  // Test API
  window.testAPI = function() {
    var el = document.getElementById('testResult');
    el.textContent = 'Testing...';
    el.style.color = 'var(--gold)';
    fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=Dark+Magician')
      .then(function(r){return r.json();})
      .then(function(d){
        if (d.data && d.data.length) { el.textContent = 'Connected! Got '+d.data.length+' results.'; el.style.color='#4ade80'; }
        else { el.textContent = 'No data returned.'; el.style.color='#fcd34d'; }
      })
      .catch(function(e){ el.textContent = 'Error: '+e.message; el.style.color='#f87171'; });
  };

  // Helpers
  function dotClass(type) {
    if (!type) return 'dm';
    var t = type.toLowerCase();
    if (t.indexOf('spell') !== -1) return 'ds';
    if (t.indexOf('trap')  !== -1) return 'dt';
    if (t.indexOf('fusion')  !== -1) return 'd-fusion';
    if (t.indexOf('synchro') !== -1) return 'd-synchro';
    if (t.indexOf('xyz')     !== -1) return 'd-xyz';
    if (t.indexOf('link')    !== -1) return 'd-link';
    if (t.indexOf('ritual')  !== -1) return 'd-ritual';
    if (t.indexOf('pendulum') !== -1) return 'd-pendulum';
    if (t.indexOf('effect')  !== -1) return 'd-effect';
    if (t.indexOf('normal')  !== -1) return 'd-normal';
    return 'dm';
  }

  function attrBadge(attr) {
    if (!attr || attr === '—') return '<span style="color:var(--silver-dim)">—</span>';
    var colors = {
      'DARK':  '#c084fc', 'LIGHT': '#fde68a', 'EARTH': '#a8955a',
      'FIRE':  '#f87171', 'WATER': '#60a5fa', 'WIND':  '#4ade80', 'DIVINE': '#fcd34d'
    };
    var c = colors[attr.toUpperCase()] || 'var(--silver)';
    return '<span style="font-family:Cinzel,serif;font-size:9px;letter-spacing:1px;color:' + c + ';border:1px solid ' + c + '33;background:' + c + '11;padding:2px 7px;border-radius:4px;text-transform:uppercase">' + esc(attr) + '</span>';
  }

  function tLabel(type) {
    if (!type) return {t:'Unknown',c:'bm'};
    var t = type.toLowerCase();
    if (t.indexOf('spell')!==-1) return {t:'Spell',c:'bs'};
    if (t.indexOf('trap')!==-1)  return {t:'Trap',c:'bt'};
    return {t:'Monster',c:'bm'};
  }

  function cClass(c) {
    return {'Mint':'c0','Near Mint':'c1','Lightly Played':'c2','Moderately Played':'c3','Heavily Played':'c4','Damaged':'c5'}[c]||'c1';
  }

  function rClass(r) {
    if (!r) return 'rc';
    var rl = r.toLowerCase();
    if (rl.indexOf('secret')!==-1||rl.indexOf('starlight')!==-1||rl.indexOf('ghost')!==-1||rl.indexOf('quarter')!==-1) return 'rs';
    if (rl.indexOf('ultra')!==-1) return 'ru';
    if (rl.indexOf('super')!==-1) return 'rr2';
    if (rl==='rare') return 'rr1';
    return 'rc';
  }

  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    setTimeout(function(){t.classList.remove('show');}, 2800);
  }

  window.openCardModal = function(cardName) {
    // Look up the card from Firestore data first
    var entry = cards.find(function(c) { return c.name === cardName; });
    var modal = document.getElementById('cardModal');

    // Populate from local data immediately
    document.getElementById('modalName').textContent = cardName;
    document.getElementById('modalEffect').textContent = entry ? (entry.desc || entry.notes || '—') : 'Loading...';

    var meta = '';
    if (entry) {
      var tl = tLabel(entry.type);
      var pc = tl.c === 'bs' ? 'ps' : tl.c === 'bt' ? 'pt' : 'pm';
      meta += '<span class="mpill ' + pc + '">' + esc(entry.type) + '</span>';
      if (entry.archetype && entry.archetype !== '—') meta += '<span class="mpill pa">' + esc(entry.archetype) + '</span>';
      if (entry.attribute && entry.attribute !== '—') meta += '<span class="mpill" style="color:var(--silver);border-color:rgba(200,192,216,0.3);background:rgba(200,192,216,0.06)">' + esc(entry.attribute) + '</span>';
    }
    document.getElementById('modalMeta').innerHTML = meta;

    var ad = '';
    if (entry && entry.atk !== '—' && entry.atk !== undefined) {
      ad = 'ATK <b style="color:var(--gold)">' + entry.atk + '</b> / DEF <b style="color:var(--gold)">' + (entry.def||'?') + '</b>';
    }
    document.getElementById('modalAtkDef').innerHTML = ad;

    var setInfo = '';
    if (entry) setInfo = (entry.setName||'') + (entry.cardNumber ? ' &middot; ' + entry.cardNumber : '');
    document.getElementById('modalSet').innerHTML = setInfo;

    modal.style.display = 'flex';

    // Fetch full card data from API to get image and description
    fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php?name=' + encodeURIComponent(cardName))
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (!data || !data.data || !data.data.length) return;
        var c = data.data[0];
        if (c.card_images && c.card_images.length) {
          var img = document.getElementById('modalImg');
          img.src = 'https://images.ygoprodeck.com/images/cards/' + c.card_images[0].id + '.jpg';
          img.style.display = 'block';
        }
        if (c.desc) document.getElementById('modalEffect').textContent = c.desc;
      })
      .catch(function() {});
  };

  window.closeCardModal = function() {
    document.getElementById('cardModal').style.display = 'none';
    document.getElementById('modalImg').src = '';
  };

  // Qty adjust
  window.adjustQty = function(id, delta) {
    requireAuth(function() {
      var card = cards.find(function(c){ return c.fid === id; });
      if (!card) return;
      var newQty = Math.max(1, (card.qty||1) + delta);
      col.doc(id).update({ qty: newQty }).catch(function(e){ toast('Update failed'); });
    });
  };

  // ── Deck Builder ───────────────────────────────────────────
  var deck = { main: [], extra: [], side: [] };

  var extraTypes = ['fusion','synchro','xyz','link'];
  function getDeckZone(type) {
    var t = (type||'').toLowerCase();
    for (var i=0; i<extraTypes.length; i++) { if (t.indexOf(extraTypes[i]) !== -1) return 'extra'; }
    return 'main';
  }

  window.filterDeckSearch = function() {
    var q = document.getElementById('deckSearch').value.trim().toLowerCase();
    var res = document.getElementById('deckSearchResults');
    if (q.length < 2) { res.style.display = 'none'; return; }
    var matches = cards.filter(function(c){ return c.name.toLowerCase().indexOf(q) !== -1; }).slice(0, 12);
    if (!matches.length) { res.style.display = 'none'; return; }
    var btnStyle = 'font-family:Cinzel,serif;font-size:8px;padding:2px 7px;border-radius:4px;border:1px solid rgba(180,40,40,0.4);background:rgba(160,30,30,0.2);color:#f0c040;cursor:pointer';
    res.innerHTML = '';
    matches.forEach(function(c) {
      var row = document.createElement('div');
      row.style.cssText = 'padding:8px 14px;cursor:pointer;font-size:14px;border-bottom:1px solid rgba(180,40,40,0.12);color:#c8b8c8;display:flex;justify-content:space-between;align-items:center';
      row.onmouseover = function(){ this.style.background='rgba(160,30,30,0.25)'; };
      row.onmouseout  = function(){ this.style.background=''; };
      var nameSpan = document.createElement('span');
      nameSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      nameSpan.textContent = c.name;
      row.appendChild(nameSpan);
      var btnWrap = document.createElement('span');
      btnWrap.style.cssText = 'display:flex;gap:6px;margin-left:8px';
      ['main','extra','side'].forEach(function(zone) {
        var btn = document.createElement('button');
        btn.setAttribute('style', btnStyle);
        btn.textContent = zone.charAt(0).toUpperCase() + zone.slice(1);
        btn.onclick = function(e){ e.stopPropagation(); addToDeck(c.fid, zone); };
        btnWrap.appendChild(btn);
      });
      row.appendChild(btnWrap);
      row.onclick = function(){ addToDeck(c.fid, 'main'); };
      res.appendChild(row);
    });
    res.style.display = 'block';
    res.style.position = 'absolute';
  };

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.deck-search-row')) {
      document.getElementById('deckSearchResults').style.display = 'none';
    }
  });

  window.addToDeck = function(fid, zone) {
    var card = cards.find(function(c){ return c.fid === fid; });
    if (!card) return;
    // Max 3 copies per card across all zones (1 for limited)
    var totalCopies = ['main','extra','side'].reduce(function(s,z){
      return s + deck[z].filter(function(d){ return d.fid === fid; }).reduce(function(s2,d){ return s2+d.qty; }, 0);
    }, 0);
    if (totalCopies >= 3) { toast('Max 3 copies of ' + card.name); return; }
    var existing = deck[zone].find(function(d){ return d.fid === fid; });
    if (existing) { existing.qty++; } else { deck[zone].push({ fid: fid, name: card.name, type: card.type, qty: 1 }); }
    document.getElementById('deckSearch').value = '';
    document.getElementById('deckSearchResults').style.display = 'none';
    renderDeck();
  };

  window.removeDeckCard = function(fid, zone) {
    var idx = deck[zone].findIndex(function(d){ return d.fid === fid; });
    if (idx === -1) return;
    if (deck[zone][idx].qty > 1) { deck[zone][idx].qty--; } else { deck[zone].splice(idx, 1); }
    renderDeck();
  };

  function renderDeck() {
    ['main','extra','side'].forEach(function(zone) {
      var el = document.getElementById(zone + 'Deck');
      var count = deck[zone].reduce(function(s,d){ return s+d.qty; }, 0);
      var countEl = document.getElementById(zone + 'Count');
      countEl.textContent = count;
      if (zone === 'main') {
        countEl.className = 'deck-zone-count' + (count > 0 ? ' ok' : '');
      } else if (zone === 'extra') {
        countEl.className = 'deck-zone-count' + (count <= 15 ? '' : ' warn');
      } else {
        countEl.className = 'deck-zone-count' + (count <= 15 ? '' : ' warn');
      }
      if (!deck[zone].length) {
        el.innerHTML = '<div class="deck-drop-target">Search above to add cards</div>';
      } else {
        el.innerHTML = '';
        deck[zone].forEach(function(d) {
          var item = document.createElement('div');
          item.className = 'deck-card-item';
          item.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;background:rgba(255,255,255,0.02)';

          var nameEl = document.createElement('span');
          nameEl.className = 'deck-card-name';
          nameEl.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
          nameEl.textContent = d.name;
          nameEl.onclick = function(){ openCardModal(d.name); };

          // Qty controls
          var qtyWrap = document.createElement('div');
          qtyWrap.style.cssText = 'display:flex;align-items:center;gap:3px;flex-shrink:0';

          var minusBtn = document.createElement('button');
          minusBtn.className = 'deck-card-rm';
          minusBtn.innerHTML = '&#8722;';
          minusBtn.title = 'Remove one copy';
          minusBtn.onclick = function(){ removeDeckCard(d.fid, zone); };

          var qtyEl = document.createElement('span');
          qtyEl.className = 'deck-card-qty';
          qtyEl.style.cssText = 'min-width:20px;text-align:center';
          qtyEl.textContent = 'x' + d.qty;

          var plusBtn = document.createElement('button');
          plusBtn.className = 'deck-card-rm';
          plusBtn.style.color = 'var(--gold-pale)';
          plusBtn.innerHTML = '+';
          plusBtn.title = 'Add one copy';
          (function(fid, dname, dtype) {
            plusBtn.onclick = function() {
              // Check collection qty limit
              var collCard = cards.find(function(c){ return c.fid === fid; });
              var collQty = collCard ? (collCard.qty || 1) : 1;
              var totalInDeck = ['main','extra','side'].reduce(function(s,z){
                return s + deck[z].filter(function(x){ return x.fid === fid; }).reduce(function(s2,x){ return s2+x.qty; },0);
              }, 0);
              if (totalInDeck >= 3) { toast('Max 3 copies of ' + dname); return; }
              if (totalInDeck >= collQty) { toast('Only ' + collQty + ' cop' + (collQty===1?'y':'ies') + ' of ' + dname + ' in collection'); return; }
              addToDeck(fid, zone);
            };
          })(d.fid, d.name, d.type);

          qtyWrap.appendChild(minusBtn);
          qtyWrap.appendChild(qtyEl);
          qtyWrap.appendChild(plusBtn);
          item.appendChild(nameEl);
          item.appendChild(qtyWrap);
          el.appendChild(item);
        });
      }
    });
    var total = ['main','extra','side'].reduce(function(s,z){ return s + deck[z].reduce(function(s2,d){ return s2+d.qty; },0); }, 0);
    var mainCount = deck.main.reduce(function(s,d){ return s+d.qty; },0);
    document.getElementById('deckTotalCount').textContent = total + ' card' + (total !== 1 ? 's' : '') + ' — Main: ' + deck.main.reduce(function(s,d){return s+d.qty;},0) + ' • Extra: ' + deck.extra.reduce(function(s,d){return s+d.qty;},0) + ' • Side: ' + deck.side.reduce(function(s,d){return s+d.qty;},0);
  }

  window.exportDeck = function() {
    var name = document.getElementById('deckName').value || 'My Deck';
    var lines = ['# ' + name, '# Exported from Scott\'s YGO Collection Tracker', ''];
    var mainCount = deck.main.reduce(function(s,d){ return s+d.qty; },0);
    lines.push('#main');
    deck.main.forEach(function(d){ for(var i=0;i<d.qty;i++) lines.push(d.name); });
    lines.push('');
    lines.push('#extra');
    deck.extra.forEach(function(d){ for(var i=0;i<d.qty;i++) lines.push(d.name); });
    lines.push('');
    lines.push('#side');
    deck.side.forEach(function(d){ for(var i=0;i<d.qty;i++) lines.push(d.name); });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], {type:'text/plain'}));
    a.download = name.replace(/[^a-z0-9]/gi,'_') + '.ydk';
    a.click();
    toast('Deck exported as .ydk!');
  };

  window.clearDeck = function() {
    deck = { main: [], extra: [], side: [] };
    renderDeck();
    toast('Deck cleared');
  };

  // ── Import .ydk ────────────────────────────────────────────
  window.importYdk = function(input) {
    var file = input.files[0];
    if (!file) return;
    requireAuth(function() {
      var reader = new FileReader();
      reader.onload = function(e) {
        var lines = e.target.result.replace(/\r/g, '').split('\n');
        var zone = 'main';
        // Parse: { zone, cardId, count }
        var parsed = { main: {}, extra: {}, side: {} }; // cardId -> {zone, count}
        lines.forEach(function(line) {
          line = line.trim();
          if (!line || line[0] === '!' || line.slice(0,2) === '//') return;
          if (line === '#main')  { zone = 'main';  return; }
          if (line === '#extra') { zone = 'extra'; return; }
          if (line === '#side')  { zone = 'side';  return; }
          if (line[0] === '#') return;
          if (/^[0-9]+$/.test(line)) {
            parsed[zone][line] = (parsed[zone][line] || 0) + 1;
          }
        });
        var allIds = [];
        ['main','extra','side'].forEach(function(z) {
          Object.keys(parsed[z]).forEach(function(id) { if (allIds.indexOf(id) === -1) allIds.push(id); });
        });
        if (!allIds.length) { toast('No card IDs found in .ydk file'); input.value = ''; return; }
        toast('Fetching ' + allIds.length + ' card(s) from API...');
        // Fetch all card data from YGOPRODeck by ID
        var fetched = {};
        var pending = allIds.slice();
        function fetchBatch() {
          if (!pending.length) { processImport(); return; }
          var batch = pending.splice(0, 10);
          var url = 'https://db.ygoprodeck.com/api/v7/cardinfo.php?id=' + batch.join(',');
          fetch(url).then(function(r){ return r.json(); }).then(function(data) {
            if (data.data) {
              data.data.forEach(function(c) {
                fetched[String(c.id)] = c;
              });
            }
            fetchBatch();
          }).catch(function() { fetchBatch(); });
        }
        function processImport() {
          var addPromises = [];
          var deckResult = { main: [], extra: [], side: [] };
          var addedCount = 0;
          var skippedCount = 0;
          ['main','extra','side'].forEach(function(z) {
            Object.keys(parsed[z]).forEach(function(cardId) {
              var c = fetched[cardId];
              if (!c) { skippedCount++; return; }
              var qty = Math.min(parsed[z][cardId], 3);
              // Check if card already in collection
              var existing = cards.find(function(col) { return String(col.cardImageId) === cardId; });
              if (existing) {
                deckResult[z].push({ fid: existing.fid, name: existing.name, type: existing.type, qty: qty });
              } else {
                // Add to collection
                var fs = (c.card_sets && c.card_sets.length) ? c.card_sets[0] : {};
                var newCard = {
                  name: c.name, type: c.type, race: c.race||'—',
                  level: c.level||c.linkval||null,
                  cardImageId: c.card_images && c.card_images.length ? c.card_images[0].id : null,
                  attribute: c.attribute||'—', archetype: c.archetype||'—',
                  atk: c.atk !== undefined ? (c.atk === -1 ? '?' : String(c.atk)) : '—',
                  def: c.def !== undefined ? (c.def === -1 ? '?' : String(c.def)) : '—',
                  setName: fs.set_name||'—', setCode: fs.set_code||'—',
                  cardNumber: fs.set_code||'—', rarity: fs.set_rarity||'Common',
                  condition: 'Near Mint', edition: '1st Edition',
                  qty: qty, price: 0, notes: '', addedAt: Date.now()
                };
                addPromises.push(
                  col.add(newCard).then(function(ref) {
                    addedCount++;
                    deckResult[z].push({ fid: ref.id, name: c.name, type: c.type, qty: qty });
                  })
                );
              }
            });
          });
          Promise.all(addPromises).then(function() {
            deck.main  = deckResult.main;
            deck.extra = deckResult.extra;
            deck.side  = deckResult.side;
            var name = file.name.replace(/\.ydk$/i,'').replace(/_/g,' ');
            document.getElementById('deckName').value = name;
            renderDeck();
            var msg = 'Import complete';
            if (addedCount) msg += ' — ' + addedCount + ' new card(s) added to collection';
            if (skippedCount) msg += ' — ' + skippedCount + ' not found';
            toast(msg);
            input.value = '';
          });
        }
        fetchBatch();
      };
      reader.readAsText(file);
    });
  };

  // Duplicate feature replaced with inline +/- controls


  // ── Theme ──────────────────────────────────────────────────
  window.applyTheme = function(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (activeProfileId) {
      db.collection('profiles').doc(activeProfileId).update({ theme: theme }).catch(function(){});
    }
    localStorage.setItem('theme_' + (activeProfileId || 'default'), theme);
  };

  function loadTheme() {
    var stored = localStorage.getItem('theme_' + (activeProfileId || 'default')) || '';
    document.documentElement.setAttribute('data-theme', stored);
    var sel = document.getElementById('themeSelect');
    if (sel) sel.value = stored;
  }

  // Patch selectProfile to load theme on profile switch
  var _origSelectProfile = window.selectProfile;
  // (theme loading injected into selectProfile below)

  // ── Drag and drop: collection rows → deck zones ────────────
  function makeDraggable() {
    var rows = document.querySelectorAll('#collBody tr');
    rows.forEach(function(row) {
      var fidCell = row.querySelector('[data-fid]') || row.querySelector('.qty-btn');
      if (!fidCell) return;
      var fid = fidCell.dataset.fid;
      if (!fid) return;
      row.setAttribute('draggable', true);
      row.style.cursor = 'grab';
      row.addEventListener('dragstart', function(ev) {
        ev.dataTransfer.setData('text/plain', fid);
        ev.dataTransfer.effectAllowed = 'copy';
        row.style.opacity = '0.5';
      });
      row.addEventListener('dragend', function() {
        row.style.opacity = '';
      });
    });
  }

  // Make deck zones drop targets
  ['main','extra','side'].forEach(function(zone) {
    var el = document.getElementById(zone + 'Deck');
    if (!el) return;
    el.addEventListener('dragover', function(ev) {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'copy';
      el.style.background = 'rgba(240,192,64,0.06)';
    });
    el.addEventListener('dragleave', function() {
      el.style.background = '';
    });
    el.addEventListener('drop', function(ev) {
      ev.preventDefault();
      el.style.background = '';
      var fid = ev.dataTransfer.getData('text/plain');
      if (fid) addToDeck(fid, zone);
    });
  });

  // Re-run makeDraggable after every renderTable
  var _origRenderTable = renderTable;
  renderTable = function() {
    _origRenderTable();
    setTimeout(makeDraggable, 0);
  };

  // Init deck render
  renderDeck();
  loadTheme();

  // ── Tab switching ─────────────────────────────────────────
  window.switchTab = function(tab) {
    ['collection','decks'].forEach(function(t) {
      document.getElementById('pane-' + t).classList.toggle('active', t === tab);
      document.getElementById('tab-' + t).classList.toggle('active', t === tab);
    });
    if (tab === 'decks') renderSavedDecks();
  };

  // ── Save deck to Firestore ─────────────────────────────────
  window.saveDeck = function() {
    var name = document.getElementById('deckName').value.trim();
    if (!name) { toast('Please enter a deck name first'); return; }
    var mainCount = deck.main.reduce(function(s,d){ return s+d.qty; },0);
    if (mainCount < 1) { toast('Deck is empty'); return; }
    requireAuth(function() {
      var deckData = {
        name: name,
        main:  deck.main.map(function(d){ return {fid:d.fid, name:d.name, type:d.type, qty:d.qty}; }),
        extra: deck.extra.map(function(d){ return {fid:d.fid, name:d.name, type:d.type, qty:d.qty}; }),
        side:  deck.side.map(function(d){ return {fid:d.fid, name:d.name, type:d.type, qty:d.qty}; }),
        mainCount:  deck.main.reduce(function(s,d){ return s+d.qty; },0),
        extraCount: deck.extra.reduce(function(s,d){ return s+d.qty; },0),
        sideCount:  deck.side.reduce(function(s,d){ return s+d.qty; },0),
        savedAt: Date.now()
      };
      if (!activeProfileId) { toast('No profile selected'); return; }
      db.collection('profiles').doc(activeProfileId).collection('decks').add(deckData).then(function() {
        toast('Deck saved: ' + name);
      }).catch(function(e){ toast('Save failed: ' + e.message); });
    });
  };

  // ── Load saved decks from Firestore ───────────────────────
  var savedDecks = [];
  function loadSavedDecks() {
    if (!activeProfileId) return;
    if (decksUnsub) { decksUnsub(); decksUnsub = null; }
    decksUnsub = db.collection('profiles').doc(activeProfileId).collection('decks').orderBy('savedAt','desc').onSnapshot(function(snap) {
      savedDecks = [];
      snap.forEach(function(doc) {
        savedDecks.push(Object.assign({ did: doc.id }, doc.data()));
      });
      var countEl = document.getElementById('savedDeckCount');
      if (countEl) countEl.textContent = savedDecks.length + ' deck' + (savedDecks.length !== 1 ? 's' : '');
      // Always re-render — both when tab is active and when a save just happened
      renderSavedDecks();
    }, function(err) {
      console.error('Decks listener error:', err);
    });
  }
  // Do NOT call loadSavedDecks() here — called by selectProfile once profile is active

  function renderSavedDecks() {
    var grid = document.getElementById('savedDecksGrid');
    if (!savedDecks.length) {
      grid.innerHTML = '<div class="deck-empty">No saved decks yet — build one in the Collection tab</div>';
      return;
    }
    grid.innerHTML = '';
    savedDecks.forEach(function(d) {
      var card = document.createElement('div');
      card.className = 'saved-deck-card';

      var nameEl = document.createElement('div');
      nameEl.className = 'saved-deck-name';
      nameEl.textContent = d.name;
      card.appendChild(nameEl);

      var meta = document.createElement('div');
      meta.className = 'saved-deck-meta';
      meta.innerHTML = '<span>Main: <b style="color:var(--gold-pale)">' + (d.mainCount||0) + '</b></span>'
        + '<span>Extra: <b style="color:var(--gold-pale)">' + (d.extraCount||0) + '</b></span>'
        + '<span>Side: <b style="color:var(--gold-pale)">' + (d.sideCount||0) + '</b></span>';
      card.appendChild(meta);

      var date = document.createElement('div');
      date.className = 'saved-deck-date';
      date.textContent = d.savedAt ? new Date(d.savedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
      card.appendChild(date);

      // Card lists by zone
      ['main','extra','side'].forEach(function(zone) {
        var zoneCards = d[zone] || [];
        if (!zoneCards.length) return;
        var section = document.createElement('div');
        section.className = 'deck-card-list-section';
        var label = document.createElement('div');
        label.className = 'deck-card-list-section-label';
        var zoneName = zone === 'main' ? 'Main Deck' : zone === 'extra' ? 'Extra Deck' : 'Side Deck';
        label.textContent = zoneName + ' (' + zoneCards.reduce(function(s,c){return s+c.qty;},0) + ')';
        section.appendChild(label);
        zoneCards.forEach(function(c) {
          var item = document.createElement('div');
          item.className = 'deck-card-list-item';
          var nameSpan = document.createElement('span');
          nameSpan.textContent = c.name;
          nameSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1';
          var qtySpan = document.createElement('span');
          qtySpan.className = 'qty-tag';
          qtySpan.textContent = c.qty > 1 ? 'x' + c.qty : '';
          item.appendChild(nameSpan);
          item.appendChild(qtySpan);
          section.appendChild(item);
        });
        card.appendChild(section);
      });

      var actions = document.createElement('div');
      actions.className = 'saved-deck-actions';

      var loadBtn = document.createElement('button');
      loadBtn.className = 'deck-action-btn load';
      loadBtn.textContent = 'Load';
      loadBtn.onclick = function(e){ e.stopPropagation(); loadDeckIntoBuilder(d); };
      actions.appendChild(loadBtn);

      var expBtn = document.createElement('button');
      expBtn.className = 'deck-action-btn export';
      expBtn.textContent = 'Export .ydk';
      expBtn.onclick = function(e){ e.stopPropagation(); exportSavedDeck(d); };
      actions.appendChild(expBtn);

      var delBtn = document.createElement('button');
      delBtn.className = 'deck-action-btn del';
      delBtn.textContent = 'Delete';
      delBtn.onclick = function(e){ e.stopPropagation(); deleteSavedDeck(d.did, d.name); };
      actions.appendChild(delBtn);

      card.appendChild(actions);
      grid.appendChild(card);
    });
  }

  window.loadDeckIntoBuilder = function(d) {
    deck.main  = (d.main  || []).slice();
    deck.extra = (d.extra || []).slice();
    deck.side  = (d.side  || []).slice();
    document.getElementById('deckName').value = d.name;
    renderDeck();
    switchTab('collection');
    // Scroll to deck builder
    setTimeout(function(){
      document.querySelector('.deck-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    toast('Loaded: ' + d.name);
  };

  window.deleteSavedDeck = function(did, name) {
    requireAuth(function() {
      if (!activeProfileId) return;
      db.collection('profiles').doc(activeProfileId).collection('decks').doc(did).delete().then(function(){
        toast('Deleted: ' + name);
      }).catch(function(e){ toast('Delete failed'); });
    });
  };

  window.exportSavedDeck = function(d) {
    var lines = ['# ' + d.name, '# Exported from Scott\'s YGO Collection Tracker', '', '#main'];
    (d.main||[]).forEach(function(c){ for(var i=0;i<c.qty;i++) lines.push(c.name); });
    lines.push('', '#extra');
    (d.extra||[]).forEach(function(c){ for(var i=0;i<c.qty;i++) lines.push(c.name); });
    lines.push('', '#side');
    (d.side||[]).forEach(function(c){ for(var i=0;i<c.qty;i++) lines.push(c.name); });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain'}));
    a.download = d.name.replace(/[^a-z0-9]/gi,'_') + '.ydk';
    a.click();
    toast('Exported: ' + d.name);
  };

  // ══ Profile Management ══════════════════════════════════════

  function selectProfile(profileId, profileName) {
    activeProfileId = profileId;
    activeProfileName = profileName;
    localStorage.setItem('activeProfileId', profileId);
    localStorage.setItem('activeProfileName', profileName);
    // label updated above
    // Hide profile screen, show app
    var ps = document.getElementById('profileScreen');
    if (ps) { ps.classList.remove('active'); ps.style.display = 'none'; }
    document.getElementById('activeProfileLabel').textContent = profileName;
    var hpn = document.getElementById('headerProfileName');
    if (hpn) hpn.textContent = profileName + "'s Yu-Gi-Oh!";
    document.title = profileName + "'s Yu-Gi-Oh! Collection Tracker";
    // Start scoped listeners
    authed = false;
    updateLockBtn();
    startProfileListener(profileId);
    loadSavedDecks();
    // Reset deck builder
    deck = { main: [], extra: [], side: [] };
    renderDeck();
  }

  window._showProfileScreen = window.showProfileScreen = function() {
    var ps = document.getElementById('profileScreen');
    if (!ps) { console.error('profileScreen element not found'); return; }
    if (decksUnsub) { decksUnsub(); decksUnsub = null; }
    if (cardsUnsub) { cardsUnsub(); cardsUnsub = null; }
    var psn = document.getElementById('profileScreenName');
    if (psn) psn.textContent = 'Collection';
    ps.style.display = 'flex';
    ps.classList.add('active');
    loadProfiles();
  };

  function loadProfiles() {
    var grid = document.getElementById('profileGrid');
    grid.innerHTML = '<div style="color:var(--silver-dim);font-family:Cinzel,serif;font-size:11px;letter-spacing:2px">Loading...</div>';
    db.collection('profiles').orderBy('createdAt','asc').get().then(function(snap) {
      grid.innerHTML = '';
      if (snap.empty) {
        // No profiles — just show the + card, handled below
      }
      snap.forEach(function(doc) {
        var p = doc.data();
        var initial = (p.name || '?')[0].toUpperCase();
        var card = document.createElement('div');
        card.className = 'ps-card';
        var avatarDiv = document.createElement('div');
        avatarDiv.className = 'ps-avatar';
        avatarDiv.textContent = initial;
        var labelDiv = document.createElement('div');
        labelDiv.className = 'ps-label';
        labelDiv.textContent = p.name;
        var metaDiv = document.createElement('div');
        metaDiv.className = 'ps-meta';
        metaDiv.textContent = (p.cardCount || 0) + ' cards';
        var delBtn = document.createElement('button');
        delBtn.className = 'ps-del';
        delBtn.title = 'Delete profile';
        delBtn.innerHTML = '&#x2715;';
        delBtn.onclick = function(e) { e.stopPropagation(); deleteProfile(doc.id, p.name); };
        card.appendChild(avatarDiv);
        card.appendChild(labelDiv);
        card.appendChild(metaDiv);
        card.appendChild(delBtn);
        card.onclick = function() { selectProfile(doc.id, p.name); };
        grid.appendChild(card);
      });
      // Add "New Profile" card
      var newCard = document.createElement('div');
      newCard.className = 'ps-card ps-new';
      var navatarDiv = document.createElement('div');
      navatarDiv.className = 'ps-avatar';
      navatarDiv.style.cssText = 'font-size:26px;border-style:dashed;background:none';
      navatarDiv.textContent = '+';
      var nlabelDiv = document.createElement('div');
      nlabelDiv.className = 'ps-label';
      nlabelDiv.style.color = 'var(--silver-dim)';
      nlabelDiv.textContent = 'New Profile';
      newCard.appendChild(navatarDiv);
      newCard.appendChild(nlabelDiv);
      newCard.onclick = function() {
        document.getElementById('newProfileModal').style.display = 'flex';
        setTimeout(function(){ document.getElementById('newProfileName').focus(); }, 50);
      };
      grid.appendChild(newCard);
    }).catch(function(e) {
    var rulesSnippet = [
      'rules_version = "2";',
      'service cloud.firestore {',
      '  match /databases/{database}/documents {',
      '    match /{document=**} {',
      '      allow read: if true;',
      '      allow write: if false;',
      '    }',
      '  }',
      '}'
    ].join('\n');
      grid.innerHTML = '<div style="text-align:center;grid-column:1/-1;padding:20px">'
        + '<div style="color:#f87171;font-family:Cinzel,serif;font-size:12px;letter-spacing:1px;margin-bottom:12px">Firestore permission error</div>'
        + '<div style="color:var(--silver-dim);font-size:12px;line-height:1.8;margin-bottom:16px">'
        + 'Update your Firestore security rules to allow reads.<br>'
        + 'Go to <b style="color:var(--gold-pale)">Firebase Console → Firestore → Rules</b> and paste:<br></div>'
        + '<code style="display:block;background:rgba(0,0,0,0.4);border:1px solid var(--border);border-radius:8px;padding:12px 16px;font-size:11px;color:#4ade80;text-align:left;white-space:pre;max-width:480px;margin:0 auto">'
        + rulesSnippet
        + '</code>'
        + '<div style="color:var(--silver-dim);font-size:11px;margin-top:12px">Then reload this page.</div>'
        + '</div>';
    });
  }

  window.createProfile = function() {
    var name = document.getElementById('newProfileName').value.trim();
    var pw   = document.getElementById('newProfilePw').value;
    var errEl = document.getElementById('newProfileError');
    if (!name) { errEl.textContent = 'Please enter a name'; return; }
    if (name.length > 24) { errEl.textContent = 'Name too long (max 24 chars)'; return; }
    if (!pw) { errEl.textContent = 'Password required'; return; }
    errEl.textContent = 'Verifying...';
    sha256(pw).then(function(hash) {
      if (hash !== PW_HASH) {
        errEl.textContent = 'Incorrect password';
        document.getElementById('newProfilePw').value = '';
        return;
      }
      errEl.textContent = '';
      db.collection('profiles').add({
        name: name,
        cardCount: 0,
        createdAt: Date.now()
      }).then(function(ref) {
        authed = true;
        updateLockBtn();
        closeNewProfileModal();
        selectProfile(ref.id, name);
      }).catch(function(e) {
        errEl.textContent = 'Error: ' + e.message;
      });
    });
  };

  window.closeNewProfileModal = function() {
    document.getElementById('newProfileModal').style.display = 'none';
    document.getElementById('newProfileName').value = '';
    document.getElementById('newProfilePw').value = '';
    document.getElementById('newProfileError').textContent = '';
  };

  function deleteProfile(profileId, profileName) {
    requireAuth(function() {
      if (!confirm('Delete profile "' + profileName + '"? This cannot be undone.')) return;
      // Delete all cards and decks subcollections then the profile doc
      // Firestore doesn't auto-delete subcollections — batch delete cards first
      var batch = db.batch();
      var profileRef = db.collection('profiles').doc(profileId);
      // Get all cards and decks to delete
      Promise.all([
        profileRef.collection('cards').get(),
        profileRef.collection('decks').get()
      ]).then(function(results) {
        results.forEach(function(snap) {
          snap.forEach(function(doc) { batch.delete(doc.ref); });
        });
        batch.delete(profileRef);
        return batch.commit();
      }).then(function() {
        toast('Profile deleted: ' + profileName);
        if (activeProfileId === profileId) {
          activeProfileId = null;
          activeProfileName = null;
          localStorage.removeItem('activeProfileId');
          localStorage.removeItem('activeProfileName');
          showProfileScreen();
        } else {
          loadProfiles();
        }
      }).catch(function(e) { toast('Delete failed: ' + e.message); });
    });
  }

  // ── Key handler for new profile modal ──
  var npnEl = document.getElementById('newProfileName');
  if (npnEl) npnEl.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeNewProfileModal();
  });
  var nppEl = document.getElementById('newProfilePw');
  if (nppEl) nppEl.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeNewProfileModal();
  });

  // ── On load: show profile screen (auto-select if remembered) ──
  if (activeProfileId && activeProfileName) {
    // Verify profile still exists before auto-selecting
    db.collection('profiles').doc(activeProfileId).get().then(function(doc) {
      if (doc.exists) {
        selectProfile(activeProfileId, activeProfileName);
      } else {
        localStorage.removeItem('activeProfileId');
        localStorage.removeItem('activeProfileName');
        loadProfiles();
      }
    }).catch(function() { loadProfiles(); });
  } else {
    loadProfiles();
  }

  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

}; // window.onload
