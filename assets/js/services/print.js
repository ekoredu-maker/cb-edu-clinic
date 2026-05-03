export function showPrintable(html) {
  const root = document.getElementById('printRoot');
  root.innerHTML = html;
  document.body.classList.add('printing');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing');
  }, 300);
}
