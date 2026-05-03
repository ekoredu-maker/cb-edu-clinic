export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null) continue;
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'value') node.value = value;
    else if (key === 'checked') node.checked = Boolean(value);
    else if (key === 'selected') node.selected = Boolean(value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  }
  return node;
}

export function empty(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function table(headers, rows, options = {}) {
  const thead = el('thead', {}, el('tr', {}, headers.map((h) => el('th', { text: h }))));
  const tbody = el('tbody');
  if (!rows.length) {
    tbody.appendChild(el('tr', {}, el('td', { text: options.emptyText || '등록된 자료가 없습니다.', colspan: headers.length })));
  } else {
    rows.forEach((cells) => tbody.appendChild(el('tr', {}, cells.map((c) => el('td', {}, c)))));
  }
  return el('div', { className: 'table-wrap' }, el('table', {}, thead, tbody));
}

export function formField(labelText, control, helperText = '') {
  return el('div', {},
    el('label', { text: labelText }),
    control,
    helperText ? el('p', { className: 'helper', text: helperText }) : null
  );
}

export function toast(message, type = 'info') {
  const root = document.getElementById('toastRoot');
  const item = el('div', { className: `toast ${type}`, text: message });
  root.appendChild(item);
  window.setTimeout(() => item.remove(), 2600);
}

export function confirmAction(message) {
  return window.confirm(message);
}

export function optionList(select, values, selectedValue = '') {
  select.replaceChildren();
  values.forEach((entry) => {
    const value = Array.isArray(entry) ? entry[0] : entry;
    const label = Array.isArray(entry) ? entry[1] : entry;
    select.appendChild(el('option', { value, text: label, selected: value === selectedValue }));
  });
  return select;
}

export function chip(text, type = '') {
  return el('span', { className: `chip ${type}`.trim(), text });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}
