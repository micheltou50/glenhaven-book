/* ── calendar.js — MiniCal class ── */

import { toISO } from './utils.js';
import { getNightlyRate } from './pricing.js';
import { isDateBlocked, isRangeBlocked } from './availability.js';

export class MiniCal {
  constructor(containerId, opts = {}) {
    this.el        = document.getElementById(containerId);
    this.onSelect  = opts.onSelect || (() => {});
    this.showPrice = opts.showPrice !== false;
    this.adminMode = opts.adminMode || false;
    this.ci  = null; this.co  = null; this.hov = null;
    this.cur = new Date(); this.cur.setDate(1);
    this.render();
  }

  render() {
    if (!this.el) return;
    const dow = ['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => `<span>${d}</span>`).join('');
    this.el.innerHTML = `
      <div class="cal-widget cal-two-months">
        <div class="cal-month-wrap">
          <div class="cal-month">
            <div class="cal-nav">
              <button class="cal-nb" id="${this.el.id}-prev">&#8249;</button>
              <div class="cal-title" id="${this.el.id}-title0"></div>
              <button class="cal-nb" style="visibility:hidden;">&#8250;</button>
            </div>
            <div class="cal-dow">${dow}</div>
            <div class="cal-grid" id="${this.el.id}-grid0"></div>
          </div>
          <div class="cal-month">
            <div class="cal-nav">
              <button class="cal-nb" style="visibility:hidden;">&#8249;</button>
              <div class="cal-title" id="${this.el.id}-title1"></div>
              <button class="cal-nb" id="${this.el.id}-next">&#8250;</button>
            </div>
            <div class="cal-dow">${dow}</div>
            <div class="cal-grid" id="${this.el.id}-grid1"></div>
          </div>
        </div>
      </div>`;
    this.el.querySelector(`#${this.el.id}-prev`).onclick = () => { this.cur.setMonth(this.cur.getMonth() - 1); this.renderDays(); };
    this.el.querySelector(`#${this.el.id}-next`).onclick = () => { this.cur.setMonth(this.cur.getMonth() + 1); this.renderDays(); };
    this.renderDays();
  }

  buildMonthHTML(monthDate) {
    const y = monthDate.getFullYear(), m = monthDate.getMonth();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const first = new Date(y, m, 1).getDay();
    const days  = new Date(y, m + 1, 0).getDate();
    let html = '';
    for (let i = 0; i < first; i++) html += '<div class="cal-day empty"></div>';
    for (let d = 1; d <= days; d++) {
      const dt        = new Date(y, m, d);
      const iso       = toISO(dt);
      const isPast    = dt < today;
      const isBlocked = isDateBlocked(iso);
      const isStart   = this.ci === iso;
      const isEnd     = this.co === iso;
      const inRange   = this.ci && this.co && iso > this.ci && iso < this.co;
      const inHover   = this.ci && !this.co && this.hov && iso > this.ci && iso <= this.hov;
      const isBeforeCI = this.ci && !this.co && iso < this.ci;
      let cls = 'cal-day';
      if (isPast || isBeforeCI) cls += ' past';
      else if (isBlocked)       cls += ' blocked';
      else                      cls += ' avail';
      if (isStart) cls += ' sel-s';
      if (isEnd)   cls += ' sel-e';
      if (inRange) cls += ' in-r';
      if (inHover) cls += ' in-h';
      let priceHtml = '';
      if (this.showPrice && !isPast && !isBlocked) {
        const rate = getNightlyRate(dt, 0);
        priceHtml = `<div class="cal-day-p">$${rate}</div>`;
      }
      html += `<div class="${cls}" data-iso="${iso}">${d}${priceHtml}</div>`;
    }
    return html;
  }

  updateClasses(gridId) {
    const grid = this.el.querySelector(`#${gridId}`);
    if (!grid) return;
    grid.querySelectorAll('.cal-day[data-iso]').forEach(el => {
      const iso       = el.dataset.iso;
      const isPast    = iso < toISO(new Date());
      const isBlocked = isDateBlocked(iso);
      const isStart   = this.ci === iso;
      const isEnd     = this.co === iso;
      const inRange   = this.ci && this.co && iso > this.ci && iso < this.co;
      const inHover   = this.ci && !this.co && this.hov && iso > this.ci && iso <= this.hov;
      const isBeforeCI = this.ci && !this.co && iso < this.ci;
      let cls = 'cal-day';
      if (isPast || isBeforeCI) cls += ' past';
      else if (isBlocked)       cls += ' blocked';
      else                      cls += ' avail';
      if (isStart) cls += ' sel-s';
      if (isEnd)   cls += ' sel-e';
      if (inRange) cls += ' in-r';
      if (inHover) cls += ' in-h';
      el.className = cls;
    });
  }

  renderMonth(monthDate, gridId, titleId) {
    const title = this.el.querySelector(`#${titleId}`);
    const grid  = this.el.querySelector(`#${gridId}`);
    title.textContent = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    grid.innerHTML = this.buildMonthHTML(monthDate);

    // Replace with clone to remove old delegated listeners
    const freshGrid = grid.cloneNode(true);
    grid.parentNode.replaceChild(freshGrid, grid);

    freshGrid.addEventListener('click', (e) => {
      const day = e.target.closest('.cal-day.avail');
      if (!day) return;
      this.selectDay(day.dataset.iso);
    });

    freshGrid.addEventListener('mouseover', (e) => {
      const day = e.target.closest('.cal-day.avail');
      if (!day) return;
      if (this.hov === day.dataset.iso) return;
      this.hov = day.dataset.iso;
      this.updateClasses(`${this.el.id}-grid0`);
      this.updateClasses(`${this.el.id}-grid1`);
    });

    freshGrid.addEventListener('mouseleave', () => {
      if (this.hov === null) return;
      this.hov = null;
      this.updateClasses(`${this.el.id}-grid0`);
      this.updateClasses(`${this.el.id}-grid1`);
    });
  }

  renderDays() {
    const m0 = new Date(this.cur.getFullYear(), this.cur.getMonth(), 1);
    const m1 = new Date(this.cur.getFullYear(), this.cur.getMonth() + 1, 1);
    this.renderMonth(m0, `${this.el.id}-grid0`, `${this.el.id}-title0`);
    this.renderMonth(m1, `${this.el.id}-grid1`, `${this.el.id}-title1`);
  }

  refreshClasses() {
    this.updateClasses(`${this.el.id}-grid0`);
    this.updateClasses(`${this.el.id}-grid1`);
  }

  selectDay(iso) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dt = new Date(iso + 'T00:00:00');

    if (dt < today) return;

    // Clicking before or on current check-in while picking checkout → reset to new check-in
    if (this.ci && !this.co && iso <= this.ci) {
      this.ci = iso; this.co = null;
      this.onSelect({ checkIn: this.ci, checkOut: null });
      this.refreshClasses();
      return;
    }

    if (!this.ci || (this.ci && this.co)) {
      this.ci = iso; this.co = null;
      this.onSelect({ checkIn: this.ci, checkOut: null });
    } else {
      if (isRangeBlocked(this.ci, iso)) {
        alert('Some dates in that range are unavailable. Please choose a shorter stay or different dates.');
        return;
      }
      this.co = iso;
      this.onSelect({ checkIn: this.ci, checkOut: this.co });
    }
    this.refreshClasses();
  }

  setRange(ci, co) {
    this.ci = ci; this.co = co;
    if (ci) { this.cur = new Date(ci + 'T00:00:00'); this.cur.setDate(1); this.renderDays(); }
    else { this.refreshClasses(); }
  }

  reset() { this.ci = null; this.co = null; this.renderDays(); }
}
