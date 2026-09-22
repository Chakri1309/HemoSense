/* HemoSense globe — vanilla-JS port of harish features-02 globe.
   Props matched: dots #737373 size 10 density 4, ocean #050505, scale 9,
   direction right, speed 1, smoothing 0, dragSpeed 5, lat 23 / lng -23. */
(function () {
  var el = document.getElementById('globe');
  if (!el) return;

  function fallback() {
    if (!el.querySelector('.globe-fallback')) {
      var d = document.createElement('div');
      d.className = 'globe-fallback';
      el.appendChild(d);
    }
  }
  if (!window.THREE) { fallback(); return; }

  var DOT_COLOR = '#737373', OCEAN = '#050505';
  var dotSpacing = 24 + ((4 - 1) / 9) * (8 - 24);      // density 4 -> 18.67
  var dotSizeM = 0.1 + ((10 - 1) / 9) * (0.5 - 0.1);   // size 10 -> 0.5
  var scaleM = 0.2 + ((9 - 1) / 19) * (2 - 0.2);       // scale 9 -> 0.958
  var rotSpeed = ((1 / 10) * 0.9);                     // speed 1, direction right
  var sens = 0.001 + (5 / 10) * (0.02 - 0.001);        // dragSpeed 5
  var INIT_LAT = 23 * Math.PI / 180, INIT_LNG = -23 * Math.PI / 180;

  var W = el.clientWidth || 320, H = el.clientHeight || 320;
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 1000);
  var globeR = 1 * scaleM;
  camera.position.set(0, 0, 2.5 / scaleM);
  camera.lookAt(0, 0, 0);

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) { fallback(); return; }
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
  var canvas = renderer.domElement;
  canvas.style.opacity = '0';
  canvas.style.transition = 'opacity 1.2s ease';
  el.appendChild(canvas);

  var group = new THREE.Group();
  group.rotation.y = INIT_LNG; group.rotation.x = INIT_LAT;
  scene.add(group);
  group.add(new THREE.Mesh(
    new THREE.SphereGeometry(globeR, 64, 64),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(OCEAN) })
  ));

  function latLng(lat, lng) {
    var la = lat * Math.PI / 180, lo = lng * Math.PI / 180;
    return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
  }

  var rotation = { x: INIT_LNG, y: INIT_LAT };
  var target = { x: INIT_LNG, y: INIT_LAT };
  var vel = { x: 0, y: 0 };
  var dragging = false, lastX = 0, lastY = 0, raf = null;

  function frame() {
    target.x += rotSpeed * 0.01;
    if (!dragging) {
      if (Math.abs(vel.x) > 0.01 || Math.abs(vel.y) > 0.01) {
        target.x += vel.x; target.y += vel.y;
        target.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, target.y));
        vel.x *= 0.7; vel.y *= 0.7;
      } else { vel.x = 0; vel.y = 0; }
    }
    rotation.x += (target.x - rotation.x);   // smoothing 0 -> lerp 1
    rotation.y += (target.y - rotation.y);
    rotation.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotation.y));
    group.rotation.y = rotation.x; group.rotation.x = rotation.y;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  canvas.addEventListener('pointerdown', function (e) {
    dragging = true; vel.x = 0; vel.y = 0; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    target.x += dx * sens; target.y += dy * sens;
    target.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, target.y));
    vel.x = dx * sens * 0.3; vel.y = dy * sens * 0.3;
    lastX = e.clientX; lastY = e.clientY;
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    canvas.addEventListener(ev, function () { dragging = false; });
  });

  function buildDots(isLand) {
    var coords = [], step = dotSpacing * 0.08, lat, lng;
    for (lat = -90; lat <= 90; lat += step) {
      var cos = Math.cos(Math.abs(lat) * Math.PI / 180);
      var lngStep = cos > 0.01 ? step / Math.max(0.3, cos) : 360;
      for (lng = -180; lng < 180; lng += lngStep) {
        if (!isLand || isLand(lng, lat)) coords.push([lng, lat]);
      }
    }
    if (!coords.length) return;
    var geo = new THREE.SphereGeometry(0.01 * dotSizeM, 4, 4);
    var mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(DOT_COLOR) });
    var inst = new THREE.InstancedMesh(geo, mat, coords.length);
    var m = new THREE.Matrix4();
    for (var i = 0; i < coords.length; i++) {
      var p = latLng(coords[i][1], coords[i][0]);
      m.makeScale(1, 1, 1);
      m.setPosition(p[0] * globeR, p[1] * globeR, p[2] * globeR);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  }

  function show() {
    renderer.render(scene, camera);
    canvas.style.opacity = '1';
    if (raf === null) raf = requestAnimationFrame(frame);
  }

  fetch('https://raw.githubusercontent.com/martynafford/natural-earth-geojson/refs/heads/master/50m/physical/ne_50m_land.json')
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (gj) {
      var bw = 1024, bh = 512;
      var c = document.createElement('canvas'); c.width = bw; c.height = bh;
      var ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, bw, bh);
      ctx.fillStyle = '#fff'; ctx.beginPath();
      function ringPath(ring) {
        ring.forEach(function (pt, i) {
          var x = ((pt[0] + 180) / 360) * bw, y = ((90 - pt[1]) / 180) * bh;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
      gj.features.forEach(function (f) {
        var g = f.geometry; if (!g) return;
        if (g.type === 'Polygon') g.coordinates.forEach(ringPath);
        else if (g.type === 'MultiPolygon') g.coordinates.forEach(function (p) { p.forEach(ringPath); });
      });
      ctx.fill();
      var px = ctx.getImageData(0, 0, bw, bh).data;
      buildDots(function (lng, lat) {
        var x = Math.round(((lng + 180) / 360) * bw) % bw;
        var y = Math.max(0, Math.min(bh - 1, Math.round(((90 - lat) / 180) * bh)));
        return px[(y * bw + x) * 4] > 128;
      });
      show();
    })
    .catch(function () { buildDots(null); show(); });  // offline: uniform dotted sphere

  if ('ResizeObserver' in window) {
    new ResizeObserver(function () {
      var w = el.clientWidth || W, h = el.clientHeight || H;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.render(scene, camera);
    }).observe(el);
  }
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    rotSpeed = 0;
  }
})();
