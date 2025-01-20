const { dialog, fs, path } = window.__TAURI__;
const { getCurrentWindow } = window.__TAURI__.window;

const info = document.querySelector('.info');
const footer = document.querySelector('footer > div');
const editor = document.querySelector('div[contenteditable]');
const placeholder = editor.getAttribute('placeholder');
let codeMode = false;
let dynamicGlow = false;
let saved = true;
let activeFilePath = null;
let timer, timer2;
let activeFile = 'untitled.txt';
let fontSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-size'));

const fileName = 'data.inkfmt';
const saveTimers = {};

async function saveData(key, value) {
  const filePath = `./${fileName}`;
  let data = {};

  try {
    const content = await fs.readTextFile(filePath);
    data = parseInkfmt(content);
  } catch (e) {}

  if (saveTimers[key]) {
    clearTimeout(saveTimers[key]);
  }

  saveTimers[key] = setTimeout(async () => {
    if (key.includes('.')) {
      const [mainKey, subKey] = key.split('.');
      data[mainKey] = data[mainKey] || {};
      data[mainKey][subKey] = value;
    } else {
      data[key] = value;
    }

    const formatted = serializeInkfmt(data);
    await fs.writeTextFile(filePath, formatted);

    delete saveTimers[key];
  }, 500);
}

async function getData(key) {
  const filePath = `./${fileName}`;
  try {
    const content = await fs.readTextFile(filePath);
    const data = parseInkfmt(content);

    if (key.includes('.')) {
      const [mainKey, subKey] = key.split('.');
      return data[mainKey]?.[subKey] || null;
    }

    return data[key] || null;
  } catch (e) {
    return null;
  }
}

async function getAll() {
  const filePath = `./${fileName}`;
  try {
    const content = await fs.readTextFile(filePath);
    return parseInkfmt(content);
  } catch (e) {
    return {};
  }
}

function parseInkfmt(content) {
  const lines = content.split('\n');
  const data = {};
  let currentSection = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1);
      const parts = currentSection.split('.');
      let ref = data;
      for (const part of parts) {
        ref[part] = ref[part] || {};
        ref = ref[part];
      }
    } else {
      const [key, ...rest] = trimmed.split('=');
      const value = rest.join('=').trim();
      if (currentSection) {
        const parts = currentSection.split('.');
        let ref = data;
        for (const part of parts) {
          ref = ref[part];
        }
        ref[key.trim()] = value.replace(/\\n/g, '\n');
      } else {
        data[key.trim()] = value.replace(/\\n/g, '\n');
      }
    }
  }

  return data;
}

function serializeInkfmt(data) {
  function serialize(obj, prefix = '') {
    let result = '';
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        const sectionName = prefix ? `${prefix}.${key}` : key;
        result += `[${sectionName}]\n${serialize(value, sectionName)}`;
      } else {
        const serializedValue = typeof value === 'string' ? value.replace(/\n/g, '\\n') : value;
        result += `${key} = ${serializedValue}\n`;
      }
    }
    return result;
  }

  return serialize(data);
}

// Utility

function makeEditor(div) {
  div.onpaste = (e) => {
    e.preventDefault();
    const clipboardData = e.clipboardData || window.clipboardData;
    const pastedText = clipboardData?.getData('text/plain') || '';
    document.execCommand('inserttext', false, pastedText);
  };

  div.addEventListener('keydown', function (e) {
    if ((e.key === 'Tab' && e.shiftKey) || e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const node = range.startContainer;
        const offset = range.startOffset;
        if (node.nodeType === Node.TEXT_NODE && offset >= 4 && node.textContent.slice(offset - 4, offset) === '    ') {
          range.setStart(node, offset - 4);
          range.setEnd(node, offset);
          range.deleteContents();
        }
      } else {
        document.execCommand('insertText', false, '    ');
      }
    } else if (['"', "'", '(', '{', '[', '<'].includes(e.key)) {
      e.preventDefault();
      const pairMap = {
        '"': '"',
        "'": "'",
        '(': ')',
        '{': '}',
        '[': ']',
        '<': '>',
      };
      const pair = pairMap[e.key];
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const startNode = document.createTextNode(e.key);
      const endNode = document.createTextNode(pair);
      range.insertNode(endNode);
      range.insertNode(startNode);
      range.setStart(startNode, 1);
      range.setEnd(startNode, 1);
      selection.removeAllRanges();
      selection.addRange(range);
    } else if (e.key === 'x' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      let start = range.startContainer;
      while (start && start.nodeType !== Node.ELEMENT_NODE) {
        start = start.parentNode;
      }
      let end = range.endContainer;
      while (end && end.nodeType !== Node.ELEMENT_NODE) {
        end = end.parentNode;
      }
      if (start && end && start === end && start.nodeType === Node.ELEMENT_NODE) {
        const lineText = start.textContent;
        navigator.clipboard.writeText(lineText).then(() => {
          start.textContent = '';
        });
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      const node = range.startContainer;
      const offset = range.startOffset;
      const lineText = node.textContent;
      let newOffset = 0;
      for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] !== ' ' && lineText[i] !== '\t') {
          newOffset = i;
          break;
        }
      }
      if (offset === newOffset || offset === 0) {
        newOffset = 0;
      }
      range.setStart(node, newOffset);
      range.setEnd(node, newOffset);
      selection.removeAllRanges();
      selection.addRange(range);
    } else if (e.key === 'b' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const isBold = document.queryCommandState('bold');
      document.execCommand('bold', false, !isBold);
    } else if (e.key === 'i' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const isItalic = document.queryCommandState('italic');
      document.execCommand('italic', false, !isItalic);
    } else if (e.key === 'u' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const isUnderline = document.queryCommandState('underline');
      document.execCommand('underline', false, !isUnderline);
    } else if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const isStrikethrough = document.queryCommandState('strikethrough');
      document.execCommand('strikethrough', false, !isStrikethrough);
    }
  });
}

function setTitle() {
  getCurrentWindow().setTitle(`Inkless${codeMode ? ' Code' : ''}${dynamicGlow ? ' (Dynamic glow)' : ''} — ${activeFile}${saved ? '' : ' *'}`);
}

// Run at start

setTitle();
makeEditor(document.querySelector('div[contenteditable]'));

// Placeholder

const updatePlaceholder = () => {
  const isEmpty = editor.textContent.replaceAll(' ', '').replaceAll('\n', '') == '';
  if (isEmpty) {
    editor.setAttribute('placeholder', placeholder);
  } else {
    editor.removeAttribute('placeholder');
  }
};

editor.addEventListener('blur', updatePlaceholder);

updatePlaceholder();

// Update elements

const updateInfo = () => {
  const text = editor.innerText.trim();
  const words = text.length > 0 ? text.split(/\s+/).filter(Boolean).length : 0;
  const chars = text.length;
  const lines = text.split(/\n/).length;
  updateDisplay('#words', words, 'word');
  updateDisplay('#chars', chars, 'character');
  updateDisplay('#lines', lines, 'line');
};

const updateDisplay = (selector, count, label) => {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = `${count} ${label}${count === 1 ? '' : 's'}`;
  }
};

updateInfo();

function updateEditor() {
  if (codeMode) {
    const e = document.querySelector('div[contenteditable]');
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const clonedRange = range.cloneRange();
    clonedRange.selectNodeContents(e);
    clonedRange.setEnd(range.endContainer, range.endOffset);
    const cursorPosition = clonedRange.toString().length;

    const createRange = (node, targetPosition) => {
      let range = document.createRange();
      range.selectNode(node);
      range.setStart(node, 0);
      let pos = 0;
      const stack = [node];
      while (stack.length > 0) {
        const current = stack.pop();
        if (current.nodeType === Node.TEXT_NODE) {
          const len = current.textContent.length;
          if (pos + len >= targetPosition) {
            range.setEnd(current, targetPosition - pos);
            return range;
          }
          pos += len;
        } else if (current.childNodes && current.childNodes.length > 0) {
          for (let i = current.childNodes.length - 1; i >= 0; i--) {
            stack.push(current.childNodes[i]);
          }
        }
      }
      range.setEnd(node, node.childNodes.length);
      return range;
    };

    const setPosition = (targetPosition) => {
      const range = createRange(e, targetPosition);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    };

    e.querySelectorAll('div').forEach((d) => {
      if (d.textContent.replaceAll(' ', '') == '') {
        return;
      }
      try {
        delete d.dataset.highlighted;
        d.className = '';
      } catch (_) {}
      hljs.highlightElement(d);
    });

    if (dynamicGlow) {
      e.querySelectorAll('& span').forEach((d) => {
        d.style.setProperty('--glow', window.getComputedStyle(d).color);
      });
    }

    setPosition(cursorPosition);

    console.clear();

    const selection2 = window.getSelection();
    const range2 = selection.getRangeAt(0);
    const cursorPositionElement = range2.endContainer;
    selection2.removeAllRanges();
    const newRange = document.createRange();
    newRange.setStart(cursorPositionElement, range2.endOffset);
    newRange.setEnd(cursorPositionElement, range2.endOffset);
    selection2.addRange(newRange);
  }
}

editor.addEventListener('input', () => {
  saved = false;
  setTitle();
  updatePlaceholder();
  clearTimeout(timer);
  clearTimeout(timer2);
  timer = setTimeout(updateInfo, 100);
  timer2 = setTimeout(() => {
    updateEditor();
  }, 2000);
});

// Handle theme and settings

function getOSTheme() {
  if (window.matchMedia) {
    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return isDarkMode ? 'dark' : 'light';
  }
  return 'light';
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
  if (event.matches) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
});

if (getOSTheme() == 'dark') {
  document.documentElement.classList.add('dark');
} else {
  document.documentElement.classList.remove('dark');
}

(async () => {
  const data = await getAll();

  if (data.theme && data.theme != 'light') {
    document.documentElement.classList.add(data.theme);
  }

  if (data.glow && data.glow == 'true') {
    document.documentElement.classList.add('glow');
  }

  if (data.dynamic_glow && data.dynamic_glow == 'true') {
    dynamicGlow = true;
  }

  if (data.code_mode && data.code_mode == "true") {
    codeMode = true;
    setTitle();
    document.documentElement.classList.add('mono');
    updateEditor();
  }
})();

// Shortcuts

document.addEventListener('keydown', async (event) => {
  const isCmdOrCtrl = event.ctrlKey || event.metaKey;
  if (isCmdOrCtrl && event.key === 's') {
    event.preventDefault();
    const text = editor.innerText.trim();
    if (text) {
      if (activeFilePath) {
        await fs.writeTextFile(activeFilePath, text);
      } else {
        const filePath = await dialog.save({
          defaultPath: 'untitled.txt',
          filters: [{ name: 'Text Files', extensions: ['txt'] }],
        });
        if (filePath) {
          activeFilePath = filePath;
          activeFile = await path.basename(filePath);
          await fs.writeTextFile(filePath, text);
        }
      }
      saved = true;
      setTitle();
    }
  }

  if (isCmdOrCtrl && event.key === 'm') {
    event.preventDefault();
    if (document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('mica');
      saveData('theme', 'mica');
    } else if (document.documentElement.classList.contains('mica')) {
      document.documentElement.classList.remove('mica');
      document.documentElement.classList.add('dark');
      saveData('theme', 'dark');
    } else {
      document.documentElement.classList.add('mica');
      saveData('theme', 'mica');
    }
  }

  if (isCmdOrCtrl && event.key === 'n') {
    event.preventDefault();
    if (document.documentElement.classList.contains('glow')) {
      document.documentElement.classList.remove('glow');
      saveData('glow', 'false');
    } else {
      document.documentElement.classList.add('glow');
      saveData('glow', 'true');
    }
  }

  if (isCmdOrCtrl && event.key === 't') {
    event.preventDefault();
    if (document.documentElement.classList.contains('mica')) {
      document.documentElement.classList.remove('mica');
      document.documentElement.classList.add('dark');
      saveData('theme', 'dark');
    } else if (document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.remove('dark');
      saveData('theme', 'light');
    } else {
      document.documentElement.classList.add('mica');
      saveData('theme', 'mica');
    }
  }

  if (isCmdOrCtrl && event.key === 'w') {
    event.preventDefault();
    const footer = document.querySelector('footer');
    if (footer) {
      footer.style.display = footer.style.display === 'none' ? '' : 'none';
    }
  }

  if (isCmdOrCtrl && event.key === 'g') {
    event.preventDefault();
    const existingGrid = document.querySelector('.grid-overlay');
    if (existingGrid) {
      existingGrid.remove();
    } else {
      const gridOverlay = document.createElement('div');
      gridOverlay.className = 'grid-overlay';
      document.body.appendChild(gridOverlay);
    }
  }

  if (isCmdOrCtrl && event.key === 'o') {
    event.preventDefault();
    const filePath = await dialog.open({
      filters: [{ name: 'Text Files', extensions: ['*'] }],
    });
    if (filePath) {
      activeFilePath = filePath;
      activeFile = await path.basename(filePath);
      saved = true;
      const fileContent = await fs.readTextFile(filePath);
      editor.innerText = fileContent;
      setTitle();
      editor.removeAttribute('placeholder');
    }
  }

  if (isCmdOrCtrl && event.key === 'e') {
    event.preventDefault();
    const spellcheck = editor.getAttribute('spellcheck') === 'true';
    editor.setAttribute('spellcheck', !spellcheck);
  }

  if (isCmdOrCtrl && event.key === 'p') {
    event.preventDefault();
    window.print();
  }

  if (isCmdOrCtrl && event.shiftKey && event.key === 'C') {
    event.preventDefault();
    if (codeMode) {
      codeMode = false;
      setTitle();
      document.documentElement.classList.remove('mono');
      saveData('code_mode', 'false');
    } else {
      codeMode = true;
      setTitle();
      document.documentElement.classList.add('mono');
      updateEditor();
      saveData('code_mode', 'true');
    }
  }

  if (isCmdOrCtrl && event.key === 'r') {
    event.preventDefault();
    window.location.reload();
  }

  if (isCmdOrCtrl && event.shiftKey && event.key === 'N') {
    event.preventDefault();
    if (dynamicGlow) {
      dynamicGlow = false;
      setTitle();
      document.documentElement.classList.remove('glow');
      saveData('dynamic_glow', 'false');
    } else {
      dynamicGlow = true;
      setTitle();
      document.documentElement.classList.add('glow');
      updateEditor();
      saveData('dynamic_glow', 'true');
    }
  }
});

document.addEventListener('wheel', (event) => {
  if (event.ctrlKey || event.metaKey) {
    if (event.deltaY < 0) {
      fontSize += 5;
    } else if (event.deltaY > 0 && fontSize > 15) {
      fontSize -= 5;
    }
    document.documentElement.style.setProperty('--font-size', `${fontSize}px`);
  }
});

// Footer scroll

footer.addEventListener('wheel', (e) => {
  if (e.deltaY !== 0) {
    footer.scrollLeft += e.deltaY;
    e.preventDefault();
  }
});
