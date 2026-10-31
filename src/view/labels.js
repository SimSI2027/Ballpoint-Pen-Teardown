// HTML labels with SVG leader lines, anchored to points on the posed pen.
const SVG_NS = 'http://www.w3.org/2000/svg';
const PRIORITY = ['button', 'rotor', 'spring', 'tip', 'cartridge', 'sleeve', 'nose', 'plunger', 'clip', 'barrel'];

export function createLabels(layer, svg, anchors) {
  const items = anchors.map((a) => {
    const el = document.createElement('div');
    el.className = 'label';
    el.textContent = a.text;
    el.dataset.id = a.id;
    layer.appendChild(el);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'leader');
    svg.appendChild(line);
    return { a, el, line, w: 0 };
  });

  return {
    setVisible(on) { layer.style.display = on ? '' : 'none'; svg.style.display = on ? '' : 'none'; },
    /**
     * @param {(a)=>({x,y,visible})} screenOf anchor -> stage pixels
     * @param {(a)=>boolean} shown whether the anchored part is solid
     */
    update(width, height, screenOf, shown) {
      const rows = { top: [], bottom: [] };
      for (const it of items) {
        const p = screenOf(it.a);
        it.p = p;
        const on = p.visible && shown(it.a) && Number.isFinite(p.x) && Number.isFinite(p.y);
        it.on = on;
        it.el.style.display = on ? '' : 'none';
        it.line.style.display = on ? '' : 'none';
        if (on) it.w = it.el.offsetWidth || 90;
      }
      // narrow stages: keep only the highest-priority labels so rows never overflow
      const maxLabels = Math.max(4, Math.floor(width / 112) * 2);
      const ranked = items.filter((i) => i.on).sort((a, b) => PRIORITY.indexOf(a.a.id) - PRIORITY.indexOf(b.a.id));
      ranked.slice(maxLabels).forEach((it) => { it.on = false; it.el.style.display = 'none'; it.line.style.display = 'none'; });
      const vis = ranked.slice(0, maxLabels).sort((a, b) => a.p.x - b.p.x);
      vis.forEach((it, i) => rows[i % 2 === 0 ? 'bottom' : 'top'].push(it));
      for (const [name, list] of Object.entries(rows)) {
        const y = name === 'top' ? Math.max(10, height * 0.07) : Math.min(height - 34, height * 0.9);
        let x = 8;
        for (const it of list) {
          x = Math.max(x, it.p.x - it.w / 2);
          it.x = x;
          x += it.w + 8;
        }
        // keep the row inside the stage: shift left if it overflows
        let over = x - 8 - (width - 8);
        for (let i = list.length - 1; i >= 0 && over > 0; i--) {
          const room = list[i].x - (i ? list[i - 1].x + list[i - 1].w + 8 : 8);
          const shift = Math.min(over, Math.max(0, room));
          list[i].x -= shift; over -= shift;
        }
        for (const it of list) {
          it.el.style.transform = `translate(${it.x.toFixed(1)}px, ${y.toFixed(1)}px)`;
          const lx = it.x + it.w / 2;
          const ly = name === 'top' ? y + 24 : y;
          it.line.setAttribute('x1', lx.toFixed(1));
          it.line.setAttribute('y1', ly.toFixed(1));
          it.line.setAttribute('x2', it.p.x.toFixed(1));
          it.line.setAttribute('y2', it.p.y.toFixed(1));
        }
      }
    },
  };
}
