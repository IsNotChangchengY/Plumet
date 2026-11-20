
import { Window } from 'happy-dom'
const window = new Window()
const { document } = window
document.body.innerHTML = '<div id="a">A<script>var s="SECRET";</script>B<span id="h" style="display:none">HID</span>C<br>D</div>'
const a = document.getElementById('a')
const r = document.createRange()
r.selectNodeContents(a)
const out = {
  inters: typeof r.intersectsNode,
  toString: r.toString(),
  computedDisplay: document.defaultView?.getComputedStyle?.(document.getElementById('h')).display,
  walker: typeof document.createTreeWalker,
  blockDisplay: document.defaultView?.getComputedStyle?.(a).display,
  comparePoint: typeof r.comparePoint,
}
const h = document.getElementById('h')
const r2 = document.createRange()
r2.setStart(h.firstChild, 0)
r2.setEnd(h.firstChild, 3)
out.intersectsText = typeof r.intersectsNode === 'function' ? r.intersectsNode(h.firstChild) : 'n/a'
out.textNodeType = a.firstChild?.nodeType
console.log(JSON.stringify(out))
