/* The canvas renderer consumes the same scene, geometry, and camera as WebGL. */
window.makeCanvasFlight = function makeCanvasFlight(THREE) {
  const domElement = document.createElement('canvas');
  const context = domElement.getContext('2d', { alpha: true });
  if (!context) throw new Error('Canvas 2D unavailable');

  const modelView = new THREE.Matrix4();
  const cameraLights = [new THREE.Vector3(1, 11, -17), new THREE.Vector3(-3, 5, 15), new THREE.Vector3(13, -3, -1)];
  const geometryNormals = new WeakMap();
  const shadeTables = new Map();
  const normalMatrix = new THREE.Matrix3();
  const normal = new THREE.Vector3();
  let width = 0;
  let height = 0;

  function setSize(newWidth, newHeight) {
    if (width === newWidth && height === newHeight) return;
    width = newWidth;
    height = newHeight;
    domElement.width = Math.max(1, Math.round(width));
    domElement.height = Math.max(1, Math.round(height));
  }

  function project(positions, projection) {
    const points = new Float32Array(positions.count * 3);
    const e = modelView.elements;
    const px = projection.elements[0] * width / 2;
    const py = projection.elements[5] * height / 2;

    for (let n = 0; n < positions.count; n++) {
      const x = positions.getX(n);
      const y = positions.getY(n);
      const z = positions.getZ(n);
      const distance = -(e[2] * x + e[6] * y + e[10] * z + e[14]);
      const divisor = projection.elements[11] ? Math.max(distance, .04) : 1;
      const i = n * 3;
      points[i] = width / 2 + (e[0] * x + e[4] * y + e[8] * z + e[12]) * px / divisor;
      points[i + 1] = height / 2 - (e[1] * x + e[5] * y + e[9] * z + e[13]) * py / divisor;
      points[i + 2] = distance;
    }
    return points;
  }

  function faceNormals(geometry) {
    if (geometryNormals.has(geometry)) return geometryNormals.get(geometry);

    const p = geometry.attributes.position;
    const index = geometry.index?.array;
    const count = index?.length ?? p.count;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const out = new Float32Array(count);

    for (let i = 0; i < count; i += 3) {
      a.fromBufferAttribute(p, index ? index[i] : i);
      b.fromBufferAttribute(p, index ? index[i + 1] : i + 1).sub(a);
      c.fromBufferAttribute(p, index ? index[i + 2] : i + 2).sub(a);
      b.cross(c).normalize().toArray(out, i);
    }
    geometryNormals.set(geometry, out);
    return out;
  }

  function shades(material) {
    const hex = material.color.getHex();
    if (shadeTables.has(hex)) return shadeTables.get(hex);

    const base = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    const table = Array.from({ length: 64 }, (_, n) => {
      const power = n / 63;
      const highlight = power ** 3;
      const channels = base.map((value, i) => Math.round(
        Math.min(255, value * (.47 + power * .93) + highlight * [141, 124, 106][i])
      ));
      return 'rgb(' + channels.join(',') + ')';
    });
    shadeTables.set(hex, table);
    return table;
  }

  function drawFlow({ object, points }) {
    const material = object.material;
    const uniforms = material.uniforms;
    const opacity = uniforms?.opacity.value ?? material.opacity;
    if (opacity < .01) return;

    const color = uniforms?.first.value ?? object.userData.fallbackInk ?? material.color;
    const endColor = uniforms?.last.value ?? color;
    const depthLimit = .15;
    if (object.isPoints) {
      context.globalAlpha = Math.min(.83, opacity * 1.7);
      context.fillStyle = endColor.getStyle();
      for (let i = 0; i < points.length; i += 3) {
        if (points[i + 2] < depthLimit) continue;
        const size = Math.min(object.userData.glowing ? 4.7 : 3, Math.max(1, (object.userData.glowing ? 22 : 12) / points[i + 2]));
        context.fillRect(points[i], points[i + 1], size, size);
      }
    } else {
      context.globalAlpha = opacity * .65;
      context.lineWidth = .7;
      context.strokeStyle = color.getStyle();
      context.beginPath();
      for (let i = 0; i < points.length; i += 6) {
        if (points[i + 2] < depthLimit || points[i + 5] < depthLimit) continue;
        context.moveTo(points[i], points[i + 1]);
        context.lineTo(points[i + 3], points[i + 4]);
      }
      if (object.userData.glowing) {
        context.strokeStyle = "#ff8645";
        context.globalAlpha = opacity * .085;
        context.lineWidth = 6;
        context.stroke();
        context.globalAlpha = opacity * .13;
        context.lineWidth = 2.5;
        context.stroke();
        context.strokeStyle = color.getStyle();
        context.globalAlpha = opacity * .67;
        context.lineWidth = .7;
      }
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function render(world, camera) {
    if (!width || !height) return;
    world.updateMatrixWorld();
    camera.updateMatrixWorld();
    context.clearRect(0, 0, width, height);

    const faces = [];
    const flows = [];
    for (const light of cameraLights) light.normalize();
    world.traverseVisible(object => {
      const geometry = object.geometry;
      if (!geometry?.attributes.position) return;

      modelView.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
      const points = project(geometry.attributes.position, camera.projectionMatrix);
      if (!object.isMesh) {
        flows.push({ object, points });
        return;
      }

      const index = geometry.index?.array;
      const normals = faceNormals(geometry);
      const table = shades(object.material);
      normalMatrix.getNormalMatrix(object.matrixWorld);
      for (let i = 0; i < normals.length; i += 3) {
        const a = (index ? index[i] : i) * 3;
        const b = (index ? index[i + 1] : i + 1) * 3;
        const c = (index ? index[i + 2] : i + 2) * 3;
        const depth = Math.min(points[a + 2], points[b + 2], points[c + 2]);
        if (depth < .06) continue;
        const x = points[a], y = points[a + 1];
        const xx = points[b], yy = points[b + 1];
        const xxx = points[c], yyy = points[c + 1];
        if ((x < 0 && xx < 0 && xxx < 0) || (x > width && xx > width && xxx > width) ||
            (y < 0 && yy < 0 && yyy < 0) || (y > height && yy > height && yyy > height)) continue;
        const area = (xx - x) * (yyy - y) - (yy - y) * (xxx - x);
        if (Math.abs(area) < .11) continue;

        normal.fromArray(normals, i).applyNormalMatrix(normalMatrix);
        if (area > 0) normal.negate();
        const strength = .17 + Math.max(0, normal.dot(cameraLights[0])) * .51 +
          Math.max(0, normal.dot(cameraLights[1])) * .24 +
          Math.max(0, normal.dot(cameraLights[2])) * .12;
        const depthMean = (points[a + 2] + points[b + 2] + points[c + 2]) / 3;
        faces.push({ points, a, b, c, color: table[Math.min(63, Math.floor(strength * 63))], opacity: object.material.opacity, depth: depthMean });
      }
    });

    flows.filter(({ object }) => object.material.uniforms && object.isLineSegments && !object.userData.foreground).forEach(drawFlow);
    faces.sort((first, second) => second.depth - first.depth);
    context.lineWidth = .65;
    for (const { points, a, b, c, color, opacity } of faces) {
      context.globalAlpha = opacity;
      context.fillStyle = context.strokeStyle = color;
      context.beginPath();
      context.moveTo(points[a], points[a + 1]);
      context.lineTo(points[b], points[b + 1]);
      context.lineTo(points[c], points[c + 1]);
      context.closePath();
      context.fill();
      context.stroke();
    }
    context.globalAlpha = 1;
    flows.filter(({ object }) => !object.material.uniforms || object.isPoints || object.userData.foreground).forEach(drawFlow);
  }

  return { domElement, setSize, render };
};
