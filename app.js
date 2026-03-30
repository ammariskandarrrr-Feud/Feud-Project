// ─────────────────────────────────────────────
//  Feed App — Application Logic v2
//  New: geolocation, location filter (KL/KD), snack mood
// ─────────────────────────────────────────────

var radius    = 10;
var maxPrice  = 999;
var deck      = [];
var idx       = 0;
var saved     = [];
var moods     = new Set();
var currentLoc = 'kl'; // 'kl' | 'kd'
var userLat = null, userLng = null;

// drag state
var dragCard = null, dragging = false;
var dsx = 0, dsy = 0, dcx = 0, dcy = 0;

// wheel
var wheelSpinning = false, wheelAngle = 0, currentWheelResult = null, wheelAnimId = null;

// confetti
var confettiParticles = [], confettiRunning = false, confettiAnimId = null;

// ── GEOLOCATION ───────────────────────────────────────────────────
// Kota Damansara centre coords approx: 3.1647° N, 101.5888° E
// Klang Valley centre: 3.1390° N, 101.6869° E

var KD_LAT = 3.1647, KD_LNG = 101.5888;
var KL_LAT = 3.1390, KL_LNG = 101.6869;

function haversineKm(lat1, lng1, lat2, lng2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
    Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
    Math.sin(dLng/2)*Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function requestLocation() {
  if (!navigator.geolocation) {
    showToast('Geolocation not supported on this device.');
    return;
  }
  var lbl = document.getElementById('locGpsLabel');
  lbl.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      var distKD = haversineKm(userLat, userLng, KD_LAT, KD_LNG);
      var distKL = haversineKm(userLat, userLng, KL_LAT, KL_LNG);
      var detected = distKD < distKL ? 'kd' : 'kl';
      setLocation(detected);
      lbl.textContent = detected === 'kd' ? 'Kota Damansara detected ✓' : 'Klang Valley detected ✓';
      document.getElementById('locGps').classList.add('active');
      dismissBanner();
      showToast('📍 Location detected: ' + (detected === 'kd' ? 'Kota Damansara' : 'Klang Valley'));
    },
    function(err) {
      lbl.textContent = 'Use my location';
      if (err.code === 1) {
        showToast('Location permission denied. Please select area manually.');
      } else {
        showToast('Could not detect location. Please select manually.');
      }
    },
    { timeout: 10000, maximumAge: 300000 }
  );
}

function dismissBanner() {
  document.getElementById('locBanner').style.display = 'none';
  localStorage.setItem('feed_loc_asked', '1');
}

function setLocation(loc) {
  currentLoc = loc;
  document.getElementById('loc-kl').classList.toggle('on', loc === 'kl');
  document.getElementById('loc-kd').classList.toggle('on', loc === 'kd');
  idx = 0; deck = getDeck(); renderStack();
}

// Show banner on first visit (only if permission not already decided)
(function() {
  var asked = localStorage.getItem('feed_loc_asked');
  if (!asked && navigator.geolocation) {
    document.getElementById('locBanner').style.display = 'flex';
  }
})();

// ── OPEN NOW ──────────────────────────────────────────────────────
function isOpenNow(r) {
  if (r.open24) return true;
  var now = new Date();
  var utc = now.getTime() + now.getTimezoneOffset() * 60000;
  var myt = new Date(utc + 8 * 3600000);
  var h = myt.getHours() + myt.getMinutes() / 60;
  var o = r.openH, c = r.closeH;
  if (c > 24) return h >= o || h < (c - 24);
  return h >= o && h < c;
}

// ── TABS ──────────────────────────────────────────────────────────
function switchTab(t) {
  document.getElementById('tdiscover').classList.toggle('on', t === 'discover');
  document.getElementById('tsaved').classList.toggle('on', t === 'saved');
  document.getElementById('pdiscover').style.display = t === 'discover' ? 'flex' : 'none';
  document.getElementById('psaved').style.display    = t === 'saved'    ? 'flex' : 'none';
  if (t === 'saved') renderSaved();
}

function toggleMood(m) {
  if (moods.has(m)) moods.delete(m); else moods.add(m);
  document.getElementById('pill-' + m).classList.toggle('on', moods.has(m));
  idx = 0; deck = getDeck(); renderStack();
}

// ── DECK ──────────────────────────────────────────────────────────
function getDeck() {
  var seen = new Set();
  return RES.filter(function(r) {
    // location filter
    if (r.area_tag !== currentLoc && r.area_tag !== 'both') return false;
    if (r.dist    > radius)   return false;
    if (r.minP    > maxPrice) return false;
    if (seen.has(r.name))     return false;
    if (moods.size > 0 && !r.moods.some(function(m) { return moods.has(m); })) return false;
    seen.add(r.name);
    return true;
  }).sort(function(a, b) { return a.minP - b.minP; });
}

// ── HELPERS ───────────────────────────────────────────────────────
function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 2500);
}
function updateBadge() {
  var b = document.getElementById('nbadge');
  if (saved.length > 0) { b.style.display = 'flex'; b.textContent = saved.length; }
  else b.style.display = 'none';
}
function savePlace(r) {
  if (!saved.find(function(p) { return p.id === r.id; })) { saved.push(r); updateBadge(); }
}
function removePlace(id) {
  saved = saved.filter(function(p) { return p.id !== id; });
  updateBadge(); renderSaved();
}
function openMaps(url) { window.open(url, '_blank'); }
function halalHtml(h) {
  if (h === 'yes') return '<span class="halal-badge halal-yes">✓ Halal</span>';
  if (h === 'no')  return '<span class="halal-badge halal-no">✗ Non-Halal</span>';
  return '';
}

// ── IMAGE LOADER ──────────────────────────────────────────────────
function buildImgArea(r, moLabel, moClass) {
  var div = document.createElement('div');
  div.className = 'cimg';
  div.style.background = r.color;

  var fb = document.createElement('span');
  fb.className = 'emoji-fb';
  fb.textContent = r.emoji || '🍽️';
  div.appendChild(fb);

  if (r.img) {
    var img = document.createElement('img');
    img.className = 'loading';
    img.alt = r.name;
    img.decoding = 'async';
    function loadImg() {
      img.onload  = function() { img.classList.remove('loading'); img.classList.add('loaded'); fb.style.display = 'none'; };
      img.onerror = function() { img.style.display = 'none'; };
      img.src = r.img;
    }
    if ('IntersectionObserver' in window) {
      var obs = new IntersectionObserver(function(entries, o) {
        if (entries[0].isIntersecting) { loadImg(); o.disconnect(); }
      }, { rootMargin: '200px' });
      obs.observe(div);
    } else { loadImg(); }
    div.appendChild(img);
  }

  var btl = document.createElement('div'); btl.className = 'btl'; btl.textContent = r.dist.toFixed(1) + ' km';
  var btr = document.createElement('div'); btr.className = 'btr'; btr.textContent = r.cuisine.split('·')[0].trim();
  var bbl = document.createElement('div'); bbl.className = 'bbl'; bbl.textContent = r.cat;
  var op  = document.createElement('div'); op.className  = 'open-pill ' + (isOpenNow(r) ? 'open-yes' : 'open-no');
  op.textContent = isOpenNow(r) ? '● Open Now' : '● Closed';
  div.appendChild(btl); div.appendChild(op); div.appendChild(btr); div.appendChild(bbl);
  if (moLabel) {
    var bbr = document.createElement('div'); bbr.className = 'bbr ' + moClass; bbr.textContent = moLabel;
    div.appendChild(bbr);
  }
  return div;
}

// ── CARD BUILDER ──────────────────────────────────────────────────
function buildCard(r, cls) {
  var ml = '', mc = '';
  if      (r.moods.indexOf('group')    > -1) { ml = '👥 Group';     mc = 'mg'; }
  else if (r.moods.indexOf('date')     > -1) { ml = '🌹 Date';      mc = 'md'; }
  else if (r.moods.indexOf('drinks')   > -1) { ml = '🍸 Drinks';    mc = 'mk'; }
  else if (r.moods.indexOf('ngopi')    > -1) { ml = '☕ Ngopi';     mc = 'mn'; }
  else if (r.moods.indexOf('fastfood') > -1) { ml = '🍟 Fast Food'; mc = 'mf'; }
  else if (r.moods.indexOf('snack')    > -1) { ml = '🍟 Snack';     mc = 'ms'; }

  var c = document.createElement('div');
  c.className = 'card ' + cls;
  c.dataset.id = r.id;
  c.appendChild(buildImgArea(r, ml, mc));

  var body = document.createElement('div');
  body.className = 'cbody';
  body.innerHTML =
    '<div class="cname">'  + r.name    + '</div>' +
    '<div class="ccuis">'  + r.cuisine + '</div>' +
    '<div class="cdesc">'  + r.desc    + '</div>' +
    halalHtml(r.halal) +
    '<div class="ctags">'  + r.tags.map(function(t) { return '<span class="ctag">' + t + '</span>'; }).join('') + '</div>' +
    '<div class="cmeta">'  +
      '<span>📍 ' + r.area   + '</span>' +
      '<span>⭐ ' + r.rating + '</span>' +
      '<span>💰 ' + r.price  + '</span>' +
      '<span>🕐 ' + r.hours  + '</span>' +
    '</div>';
  c.appendChild(body);
  return c;
}

// ── DRAG ──────────────────────────────────────────────────────────
window.addEventListener('mousemove', function(e) {
  if (!dragging || !dragCard) return;
  dcx = e.clientX - dsx; dcy = e.clientY - dsy;
  dragCard.style.transform = 'translateX('+dcx+'px) translateY('+(dcy*.25)+'px) rotate('+(dcx*.07)+'deg)';
  updateHints();
});
window.addEventListener('touchmove', function(e) {
  if (!dragging || !dragCard) return;
  dcx = e.touches[0].clientX - dsx; dcy = e.touches[0].clientY - dsy;
  dragCard.style.transform = 'translateX('+dcx+'px) translateY('+(dcy*.25)+'px) rotate('+(dcx*.07)+'deg)';
  updateHints();
}, { passive: true });
function updateHints() {
  var hl = document.getElementById('hl'), hn = document.getElementById('hn');
  var ratio = Math.min(Math.abs(dcx) / 90, 1);
  if (dcx > 25)       { hl.style.opacity = ratio; hn.style.opacity = 0; }
  else if (dcx < -25) { hn.style.opacity = ratio; hl.style.opacity = 0; }
  else                { hl.style.opacity = 0;     hn.style.opacity = 0; }
}
function endDrag() {
  if (!dragging || !dragCard) return;
  dragging = false;
  document.getElementById('hl').style.opacity = 0;
  document.getElementById('hn').style.opacity = 0;
  if (dcx > 80) doSwipe('right'); else if (dcx < -80) doSwipe('left');
  else { dragCard.style.transform = ''; dragCard = null; }
}
window.addEventListener('mouseup',  endDrag);
window.addEventListener('touchend', endDrag);
function attachDrag(card) {
  card.addEventListener('mousedown', function(e) {
    if (dragging) return; dragging = true; dragCard = card; dcx = 0; dcy = 0;
    dsx = e.clientX; dsy = e.clientY;
  });
  card.addEventListener('touchstart', function(e) {
    if (dragging) return; dragging = true; dragCard = card; dcx = 0; dcy = 0;
    dsx = e.touches[0].clientX; dsy = e.touches[0].clientY;
  }, { passive: true });
}

// ── SWIPE ─────────────────────────────────────────────────────────
function doSwipe(dir) {
  var card = dragCard; dragCard = null; if (!card) return;
  var r = deck[idx];
  if (dir === 'right') { card.classList.add('gr'); savePlace(r); showToast('❤️ ' + r.name + ' saved!'); spawnHearts(); }
  else                 { card.classList.add('gl'); showToast('⏭️ Skipped'); }
  setTimeout(function() { idx++; renderStack(); }, 430);
}

// ── RENDER STACK ──────────────────────────────────────────────────
function renderStack() {
  var s = document.getElementById('stack'); s.innerHTML = '';
  if (idx >= deck.length) {
    var w = document.createElement('div'); w.className = 'empty-state';
    w.innerHTML = '<div class="empty-emoji">😢</div>' +
      '<div class="empty-title">You ran out of cards!</div>' +
      '<div class="empty-sub">Try a wider radius, higher price or switch location.</div>' +
      '<button class="refresh-btn" id="refreshBtn">🔄 Refresh Cards</button>';
    s.appendChild(w);
    document.getElementById('refreshBtn').addEventListener('click', function() { idx = 0; deck = getDeck(); renderStack(); });
    return;
  }
  var slice = deck.slice(idx, idx + 3), cls = ['bot', 'mid', 'top'];
  for (var i = Math.min(slice.length, 3) - 1; i >= 0; i--) {
    var card = buildCard(slice[i], cls[i]); s.insertBefore(card, s.firstChild);
  }
  var top = s.querySelector('.card.top'); if (top) attachDrag(top);
}

// ── SAVED PAGE ────────────────────────────────────────────────────
function renderSaved() {
  var el = document.getElementById('svdlist'), sub = document.getElementById('svdsub'), sb = document.getElementById('spinWheelBtn');
  if (!saved.length) {
    el.innerHTML = '<div class="svdempty"><div class="eico">🤍</div><p>No saved places yet.<br>Swipe right or tap Like on<br>places you want to visit!</p></div>';
    sub.textContent = 'Places you liked — ready when you are'; sb.style.display = 'none'; return;
  }
  sub.textContent = saved.length + ' place' + (saved.length > 1 ? 's' : '') + ' saved';
  sb.style.display = 'block';
  el.innerHTML = '';
  saved.forEach(function(r) {
    var hs = '', hc = '';
    if (r.halal === 'yes') { hs = '✓ Halal'; hc = 'y'; }
    if (r.halal === 'no')  { hs = '✗ Non-Halal'; hc = 'n'; }
    var div = document.createElement('div'); div.className = 'svdcard';
    var sico = document.createElement('div'); sico.className = 'sico'; sico.style.background = r.color;
    var fb = document.createElement('div'); fb.className = 'sico-fb'; fb.textContent = r.emoji || '🍽️';
    sico.appendChild(fb);
    if (r.img) {
      var img = document.createElement('img'); img.alt = r.name;
      img.onload  = function() { fb.style.display = 'none'; };
      img.onerror = function() { img.style.display = 'none'; };
      img.src = r.img;
      sico.appendChild(img);
    }
    div.appendChild(sico);
    div.innerHTML += '<div class="sinf"><div class="sname">' + r.name + '</div>' +
      (hs ? '<div class="shalal ' + hc + '">' + hs + '</div>' : '') +
      '<div class="ssub">' + r.cat + ' · ' + r.area + '</div>' +
      '<div class="smeta"><span>⭐ ' + r.rating + '</span><span>💰 ' + r.price + '</span><span>🕐 ' + r.hours + '</span></div></div>' +
      '<div class="sact"><button class="mbtn" onclick="openMaps(\'' + r.maps + '\')">📍 Maps</button>' +
      '<button class="rbtn" onclick="removePlace(' + r.id + ')">Remove</button></div>';
    el.appendChild(div);
  });
}

// ── HEARTS ────────────────────────────────────────────────────────
function spawnHearts() {
  var btn = document.getElementById('btnLike');
  var br = btn.getBoundingClientRect(), ar = document.getElementById('app').getBoundingClientRect();
  var emojis = ['❤️','💖','💗','💕','💞','🧡','💛','💝'];
  for (var i = 0; i < 9; i++) {
    (function(i) { setTimeout(function() {
      var el = document.createElement('div'); el.className = 'fheart';
      el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      el.style.left  = (br.left - ar.left + br.width / 2 + (Math.random() - 0.5) * 55) + 'px';
      el.style.top   = (br.top  - ar.top  - 10) + 'px';
      el.style.fontSize = (13 + Math.random() * 13) + 'px';
      el.style.animationDuration = (0.7 + Math.random() * 0.5) + 's';
      document.getElementById('app').appendChild(el);
      setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 1200);
    }, i * 70); })(i);
  }
}

// ── BUTTONS ───────────────────────────────────────────────────────
document.getElementById('btnSkip').addEventListener('click', function() {
  var top = document.getElementById('stack').querySelector('.card.top');
  if (!top || idx >= deck.length) return; dragCard = top; dcx = -999; doSwipe('left');
});
document.getElementById('btnLike').addEventListener('click', function() {
  var top = document.getElementById('stack').querySelector('.card.top');
  if (!top || idx >= deck.length) return; dragCard = top; dcx = 999; doSwipe('right');
});
document.getElementById('btnGoNow').addEventListener('click', function() {
  var r = deck[idx]; if (!r) return;
  var top = document.getElementById('stack').querySelector('.card.top'); if (!top) return;
  savePlace(r); spawnHearts(); showToast('🗺️ Opening ' + r.name + '...');
  dragCard = top; dcx = 999; doSwipe('right');
  setTimeout(function() { window.open(r.maps, '_blank'); }, 450);
});
document.getElementById('radslider').addEventListener('input', function() {
  radius = parseInt(this.value);
  document.getElementById('radval').textContent = radius + ' km';
  idx = 0; deck = getDeck(); renderStack();
});
document.getElementById('priceslider').addEventListener('input', function() {
  maxPrice = parseInt(this.value);
  document.getElementById('priceval').textContent = 'RM ' + maxPrice;
  idx = 0; deck = getDeck(); renderStack();
});

// ── WHEEL ─────────────────────────────────────────────────────────
var WC = ['#FF6B35','#F59E0B','#EF4444','#22C55E','#6366F1','#EC4899','#14B8A6','#F97316','#8B5CF6','#0EA5E9','#84CC16','#E11D48'];
function openWheel() {
  if (saved.length < 2) { showToast('Save at least 2 places first!'); return; }
  document.getElementById('wheelOverlay').style.display  = 'flex';
  document.getElementById('wheelResult').innerHTML       = '';
  document.getElementById('wMapsBtn').style.display      = 'none';
  document.getElementById('wSpinBtn').style.display      = 'inline-block';
  currentWheelResult = null; drawWheel(wheelAngle);
}
function closeWheel() { document.getElementById('wheelOverlay').style.display = 'none'; stopConfetti(); }
function drawWheel(angle) {
  var cv = document.getElementById('wheelCanvas'), ctx = cv.getContext('2d');
  var W = cv.width, H = cv.height, cx = W/2, cy = H/2, r = W/2-4, n = saved.length, arc = 2*Math.PI/n;
  ctx.clearRect(0,0,W,H);
  for (var i = 0; i < n; i++) {
    var s2 = angle+i*arc, e2 = s2+arc;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,s2,e2); ctx.closePath();
    ctx.fillStyle = WC[i%WC.length]; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(s2+arc/2); ctx.textAlign = 'right';
    ctx.fillStyle = '#fff'; ctx.font = 'bold '+(n>8?'9':'11')+'px system-ui,sans-serif';
    var lbl = (saved[i].emoji||'🍽️') + ' ' + saved[i].name; if (lbl.length > 16) lbl = lbl.substring(0,15)+'…';
    ctx.fillText(lbl, r-8, 4); ctx.restore();
  }
  ctx.beginPath(); ctx.arc(cx,cy,15,0,2*Math.PI); ctx.fillStyle = '#fff'; ctx.fill();
}
function spinWheel() {
  if (wheelSpinning) return; wheelSpinning = true;
  document.getElementById('wSpinBtn').style.display = 'none';
  document.getElementById('wMapsBtn').style.display = 'none';
  document.getElementById('wheelResult').innerHTML = '<div style="color:#aaa;font-size:12px;padding-top:8px;">Spinning...</div>';
  var n = saved.length, arc = 2*Math.PI/n, winIdx = Math.floor(Math.random()*n), spins = 8+Math.floor(Math.random()*5);
  var targetAngle = (spins*2*Math.PI) - (winIdx*arc+arc/2) - (Math.PI/2);
  var start = wheelAngle, target = start+((targetAngle-start%(2*Math.PI)+2*Math.PI)%(2*Math.PI))+spins*2*Math.PI;
  var t0 = null, dur = 5000+Math.random()*1500;
  function ease(t) { return 1-Math.pow(1-t,4); }
  function frame(ts) {
    if (!t0) t0 = ts; var p = Math.min((ts-t0)/dur,1);
    wheelAngle = start+(target-start)*ease(p); drawWheel(wheelAngle);
    if (p < 1) { wheelAnimId = requestAnimationFrame(frame); }
    else {
      wheelSpinning = false; currentWheelResult = saved[winIdx];
      document.getElementById('wheelResult').innerHTML =
        '<div class="wr-emoji">'+(currentWheelResult.emoji||'🍽️')+'</div>' +
        '<div class="wr-name">'+currentWheelResult.name+'</div>' +
        '<div class="wr-sub">'+currentWheelResult.area+' · '+currentWheelResult.price+'</div>';
      document.getElementById('wSpinBtn').style.display = 'inline-block';
      document.getElementById('wMapsBtn').style.display = 'inline-block';
      document.getElementById('wMapsBtn').onclick = function() { openMaps(currentWheelResult.maps); };
      launchConfetti();
    }
  }
  wheelAnimId = requestAnimationFrame(frame);
}

// ── CONFETTI ──────────────────────────────────────────────────────
function launchConfetti() {
  var cv = document.getElementById('confettiCanvas');
  cv.style.display = 'block'; cv.width = window.innerWidth; cv.height = window.innerHeight;
  confettiParticles = [];
  var cols = ['#FF6B35','#FF4D6D','#FFD700','#22C55E','#6366F1','#F59E0B','#EF4444','#8B5CF6','#14B8A6','#fff','#FFC371','#EC4899'];
  for (var i = 0; i < 280; i++) {
    confettiParticles.push({
      x:Math.random()*cv.width, y:-20-Math.random()*250,
      w:6+Math.random()*10, h:4+Math.random()*5,
      color:cols[Math.floor(Math.random()*cols.length)],
      vx:(Math.random()-.5)*6, vy:3+Math.random()*5,
      rot:Math.random()*360, rv:(Math.random()-.5)*9, op:1,
      shape:Math.random()>.5?'rect':'circle'
    });
  }
  confettiRunning = true; animateConfetti(); setTimeout(stopConfetti, 5000);
}
function animateConfetti() {
  if (!confettiRunning) return;
  var cv = document.getElementById('confettiCanvas'), ctx = cv.getContext('2d');
  ctx.clearRect(0,0,cv.width,cv.height);
  confettiParticles.forEach(function(p) {
    p.x+=p.vx; p.y+=p.vy; p.rot+=p.rv;
    if (p.y > cv.height) p.op = Math.max(0, p.op-.06);
    ctx.save(); ctx.globalAlpha = p.op; ctx.translate(p.x,p.y); ctx.rotate(p.rot*Math.PI/180);
    ctx.fillStyle = p.color;
    if (p.shape==='circle') { ctx.beginPath(); ctx.arc(0,0,p.w/2,0,2*Math.PI); ctx.fill(); }
    else { ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h); }
    ctx.restore();
  });
  confettiParticles = confettiParticles.filter(function(p) { return p.op > 0; });
  if (confettiParticles.length > 0) confettiAnimId = requestAnimationFrame(animateConfetti);
  else stopConfetti();
}
function stopConfetti() {
  confettiRunning = false; if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
  var cv = document.getElementById('confettiCanvas');
  cv.getContext('2d').clearRect(0,0,cv.width,cv.height); cv.style.display = 'none';
}

// ── INIT ──────────────────────────────────────────────────────────
deck = getDeck(); renderStack();
