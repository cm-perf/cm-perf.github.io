// Scroll progress stays in this page. No cookies, analytics or network calls.
const reward = document.querySelector('[data-reader-reward]');
if (reward) {
  let queued = false;
  function checkProgress() {
    queued = false;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable <= 0 || window.scrollY / scrollable < 0.5) return;
    reward.hidden = false;
    window.removeEventListener('scroll', queueCheck);
  }
  function queueCheck() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(checkProgress);
  }
  window.addEventListener('scroll', queueCheck, {passive:true});

}
