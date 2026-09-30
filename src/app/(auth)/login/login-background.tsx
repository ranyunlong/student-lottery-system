'use client';

import { useEffect, useRef } from 'react';

export function LoginBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let frame = 0;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.round(width * ratio);
      canvas!.height = Math.round(height * ratio);
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw(0);
    }

    function draw(time: number) {
      const ctx = context!;
      const phase = time * 0.00032;
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, '#a9dfe1'); sky.addColorStop(.6, '#e7f7e7'); sky.addColorStop(1, '#fff1c7');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
      const sunX = width * .82, sunY = height * .21;
      ctx.fillStyle = 'rgba(255,230,109,.65)'; ctx.beginPath(); ctx.arc(sunX, sunY, Math.min(width * .08, 74), 0, Math.PI * 2); ctx.fill();

      for (const [index, x, y, scale] of [[0, .1, .18, 1], [1, .67, .12, .7], [2, .88, .35, .8]]) {
        const cx = x * width + (motion?.matches ? 0 : Math.sin(phase + index) * 16), cy = y * height, r = scale * 32;
        ctx.fillStyle = 'rgba(255,253,240,.78)'; ctx.beginPath();
        ctx.ellipse(cx, cy + r * .45, r * 2, r * .5, 0, 0, Math.PI * 2);
        ctx.arc(cx - r * .6, cy, r * .7, 0, Math.PI * 2); ctx.arc(cx + r * .25, cy - r * .25, r, 0, Math.PI * 2); ctx.fill();
      }

      ctx.fillStyle = '#b4dfbd'; ctx.beginPath(); ctx.moveTo(0, height * .79);
      ctx.quadraticCurveTo(width * .3, height * .65, width * .57, height * .81);
      ctx.quadraticCurveTo(width * .78, height * .7, width, height * .75);
      ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.fill();
      ctx.fillStyle = '#80c8aa'; ctx.beginPath(); ctx.moveTo(0, height * .9);
      ctx.quadraticCurveTo(width * .45, height * .79, width, height * .88);
      ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.fill();

      // Pennants stay near the top, away from the form and title.
      ctx.strokeStyle = '#438f86'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 28);
      ctx.quadraticCurveTo(width * .5, 100, width, 26); ctx.stroke();
      const flagCount = Math.ceil(width / 78);
      for (let index = 0; index < flagCount; index++) {
        const x = index * 78 + 28;
        const y = 28 + 68 * (1 - Math.pow(2 * x / width - 1, 2));
        const sway = motion?.matches ? 0 : Math.sin(phase + index * .7) * 3;
        ctx.fillStyle = ['#ff8650', '#ffe66d', '#4ecdc4'][index % 3];
        ctx.beginPath(); ctx.moveTo(x - 13, y); ctx.lineTo(x + 13, y); ctx.lineTo(x + sway, y + 26); ctx.closePath(); ctx.fill();
      }

      for (const x of [width * .05, width * .94]) {
        ctx.fillStyle = '#4b9e85'; ctx.fillRect(x, height * .65, 5, height * .24);
        ctx.fillStyle = '#75bda2'; ctx.beginPath(); ctx.arc(x, height * .64, 35, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5aa98f'; ctx.beginPath(); ctx.arc(x - 17, height * .68, 26, 0, Math.PI * 2); ctx.fill();
      }

      const wheelX = width > 740 ? width * .9 : width * .9;
      const wheelY = height * .68;
      const wheelRadius = Math.min(width * .13, 90);
      ctx.strokeStyle = 'rgba(53, 135, 124, .42)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(wheelX, wheelY, wheelRadius, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wheelX, wheelY); ctx.lineTo(wheelX - wheelRadius * .55, height * .89);
      ctx.moveTo(wheelX, wheelY); ctx.lineTo(wheelX + wheelRadius * .55, height * .89); ctx.stroke();
      for (let index = 0; index < 8; index++) {
        const angle = index * Math.PI / 4 + (motion?.matches ? 0 : phase * .16);
        const x = wheelX + Math.cos(angle) * wheelRadius;
        const y = wheelY + Math.sin(angle) * wheelRadius;
        ctx.strokeStyle = 'rgba(53,135,124,.4)'; ctx.beginPath(); ctx.moveTo(wheelX, wheelY); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = ['#ff8650', '#ffe66d', '#4ecdc4'][index % 3];
        ctx.beginPath(); ctx.arc(x, y + 5, 5, 0, Math.PI * 2); ctx.fill();
      }

      for (const [index, baseX, baseY, color] of [[0, .13, .38, '#ff8650'], [1, .82, .43, '#ffe66d'], [2, .72, .25, '#4ecdc4']] as const) {
        const x = width * baseX + (motion?.matches ? 0 : Math.sin(phase * .75 + index * 2) * 15);
        const y = height * baseY + (motion?.matches ? 0 : Math.sin(phase * 1.2 + index) * 12);
        ctx.strokeStyle = 'rgba(77,116,99,.46)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y + 21);
        ctx.quadraticCurveTo(x + 10, y + 42, x + 3, y + 68); ctx.stroke();
        ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, 17, 22, 0, 0, Math.PI * 2); ctx.fill();
      }
    }

    function animate(time: number) {
      draw(time);
      frame = window.requestAnimationFrame(animate);
    }

    function updateMotion() {
      window.cancelAnimationFrame(frame);
      if (motion?.matches || document.hidden) draw(0);
      else frame = window.requestAnimationFrame(animate);
    }

    resize();
    updateMotion();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', updateMotion);
    motion?.addEventListener('change', updateMotion);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', updateMotion);
      motion?.removeEventListener('change', updateMotion);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />;
}
