(function () {
  const storageKey = "hajimi-history-static";
  const modeLabel = document.getElementById("modeLabel");
  const modeSummary = document.getElementById("modeSummary");
  const inputLabel = document.getElementById("inputLabel");
  const outputLabel = document.getElementById("outputLabel");
  const inputBox = document.getElementById("inputBox");
  const outputBox = document.getElementById("outputBox");
  const keyInput = document.getElementById("keyInput");
  const inputStats = document.getElementById("inputStats");
  const outputStats = document.getElementById("outputStats");
  const statusMessage = document.getElementById("statusMessage");
  const historyList = document.getElementById("historyList");
  const swapButton = document.getElementById("swapButton");
  const pasteButton = document.getElementById("pasteButton");
  const clearButton = document.getElementById("clearButton");
  const copyButton = document.getElementById("copyButton");
  const clearHistoryButton = document.getElementById("clearHistoryButton");

  const BASE_WORDS = [
    "哈基米",
    "奈诺娜美嘎",
    "南北绿豆",
    "欧莫季里",
    "阿西噶压",
    "库路曼波",
    "椰奶龙",
    "友吉哒",
    "酷哇里",
    "米噜达"
  ];
  const FILLERS = ["椰椰", "多多", "曼曼", "米米", "哒哒", "噜噜", "咕咕"];
  const ENDINGS = ["哦吗吉利", "哈库达曼", "咔哩咔哩", "呜啦咪诺"];
  const PUNCTUATION = ["，", "；", "。", "？"];
  const SIGNATURE_XOR = 90;

  const state = {
    mode: "encode",
    output: "",
    loading: false,
    history: loadHistory(),
    lastUpdated: ""
  };

  let translateTimer = null;
  let historyTimer = null;

  function loadHistory() {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveHistory() {
    localStorage.setItem(storageKey, JSON.stringify(state.history));
  }

  function countText(text) {
    const trimmed = text.trim();
    return {
      chars: text.length,
      words: trimmed ? trimmed.split(/\s+/).length : 0
    };
  }

  function updateStats() {
    const inputCount = countText(inputBox.value);
    const outputCount = countText(outputBox.value);
    inputStats.textContent = `字数 ${inputCount.chars} / 词数 ${inputCount.words}`;
    outputStats.textContent = `字数 ${outputCount.chars} / 词数 ${outputCount.words}`;
  }

  function setStatus(type, text) {
    statusMessage.className = `status-message ${type}`;
    statusMessage.textContent = text;
  }

  function fnv1a(input) {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createSeedBytes(key) {
    const seedSource = `hajimi:${key || "default-dialect"}`;
    const bytes = new Uint8Array(32);
    for (let i = 0; i < bytes.length; i += 1) {
      const value = fnv1a(`${seedSource}:${i}`);
      bytes[i] = value % 256;
    }
    return bytes;
  }

  function xorBytes(bytes, seedBytes) {
    return Uint8Array.from(
      bytes.map(function (value, index) {
        return value ^ seedBytes[index % seedBytes.length] ^ ((index * 17) % 251);
      })
    );
  }

  function createSignature(seedBytes) {
    return Array.from(seedBytes.slice(0, 4), function (value) {
      return BASE_WORDS[(value ^ SIGNATURE_XOR) % BASE_WORDS.length];
    }).join("");
  }

  function encodeChunk(value, index, seedBytes) {
    const mixed = (value + seedBytes[index % seedBytes.length] + index) % 256;
    const firstIndex = Math.floor(mixed / (FILLERS.length * ENDINGS.length));
    const secondIndex = Math.floor(mixed / ENDINGS.length) % FILLERS.length;
    const endingIndex = mixed % ENDINGS.length;
    const punct = PUNCTUATION[(value + index) % PUNCTUATION.length];
    return `${BASE_WORDS[firstIndex]}${FILLERS[secondIndex]}${ENDINGS[endingIndex]}${punct}`;
  }

  function decodeChunk(chunk, index, seedBytes) {
    const first = BASE_WORDS.find(function (item) {
      return chunk.startsWith(item);
    });
    if (!first) {
      throw new Error("没有找到可解析的哈基咪语编码。");
    }

    const afterFirst = chunk.slice(first.length);
    const second = FILLERS.find(function (item) {
      return afterFirst.startsWith(item);
    });
    if (!second) {
      throw new Error("哈基咪语结构损坏，无法反解析。");
    }

    const afterSecond = afterFirst.slice(second.length);
    const ending = ENDINGS.find(function (item) {
      return afterSecond.startsWith(item);
    });
    if (!ending) {
      throw new Error("哈基咪语结构损坏，无法反解析。");
    }

    const firstIndex = BASE_WORDS.indexOf(first);
    const secondIndex = FILLERS.indexOf(second);
    const endingIndex = ENDINGS.indexOf(ending);
    const mixed = firstIndex * FILLERS.length * ENDINGS.length + secondIndex * ENDINGS.length + endingIndex;

    return (mixed - seedBytes[index % seedBytes.length] - index + 512) % 256;
  }

  function splitPayload(text) {
    const signatureIndex = text.indexOf("密咒");
    const payload = signatureIndex >= 0 ? text.slice(0, signatureIndex) : text;
    const parts = [];
    let buffer = "";

    for (const char of payload) {
      buffer += char;
      if (PUNCTUATION.includes(char)) {
        parts.push(buffer);
        buffer = "";
      }
    }

    return parts.filter(Boolean);
  }

  function encodeHajimi(text, key) {
    const seedBytes = createSeedBytes(key);
    const sourceBytes = new TextEncoder().encode(text);
    const encrypted = xorBytes(sourceBytes, seedBytes);
    const signature = createSignature(seedBytes);

    return Array.from(encrypted, function (item, index) {
      return encodeChunk(item, index, seedBytes);
    }).join("") + `密咒${signature}。`;
  }

  function decodeHajimi(text, key) {
    const seedBytes = createSeedBytes(key);
    const signature = createSignature(seedBytes);

    if (!text.includes(`密咒${signature}`)) {
      throw new Error("密钥不正确，或这段哈基咪语不是用当前方言生成的。");
    }

    const chunks = splitPayload(text);
    if (!chunks.length) {
      throw new Error("没有找到可解析的哈基咪语编码。");
    }

    const encryptedBytes = Uint8Array.from(
      chunks.map(function (chunk, index) {
        return decodeChunk(chunk, index, seedBytes);
      })
    );

    const originalBytes = xorBytes(encryptedBytes, seedBytes);

    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(originalBytes);
    } catch (error) {
      throw new Error("解密失败，当前密钥无法还原出有效文本。");
    }
  }

  function updateModeUI() {
    const encodeMode = state.mode === "encode";
    modeLabel.textContent = encodeMode ? "人类 -> 哈基咪" : "哈基咪 -> 人类";
    modeSummary.textContent = encodeMode
      ? "正在把人类语整理成哈基咪语。"
      : "正在把哈基咪语还原成人类语。";
    inputLabel.textContent = encodeMode ? "人类输入" : "哈基咪输入";
    outputLabel.textContent = encodeMode ? "哈基咪输出" : "人类输出";
    inputBox.placeholder = encodeMode ? "今晚一起去看极光吗？" : "欧莫季里椰椰压哈基米，南北绿豆多多奈诺娜美嘎？";
    swapButton.title = encodeMode ? "切换为哈基咪 -> 人类" : "切换为人类 -> 哈基咪";
    swapButton.setAttribute("aria-label", encodeMode ? "互换为哈基咪转人类模式" : "互换为人类转哈基咪模式");
  }

  function renderHistory() {
    if (!state.history.length) {
      historyList.innerHTML = '<div class="empty-state"><p>还没有历史记录。先试一段文本，再决定用哪种方言。</p></div>';
      return;
    }

    historyList.innerHTML = state.history.map(function (item) {
      return `
        <article class="history-item">
          <div class="history-meta">
            <strong>${item.mode === "encode" ? "人类 -> 哈基咪" : "哈基咪 -> 人类"}</strong>
            <span>${item.createdAt}</span>
          </div>
          <p class="history-input">${escapeHtml(item.input)}</p>
          <p class="history-output">${escapeHtml(item.output)}</p>
          <div class="history-actions">
            <button class="text-button" type="button" data-action="restore" data-id="${item.id}">回填</button>
            <button class="text-button danger" type="button" data-action="remove" data-id="${item.id}">删除</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function queueTranslate() {
    clearTimeout(translateTimer);
    translateTimer = setTimeout(runTranslate, 320);
  }

  function runTranslate() {
    const text = inputBox.value.trim();
    if (!text) {
      outputBox.value = "";
      state.output = "";
      state.lastUpdated = "";
      setStatus("hint", "结果会自动更新，同输入和同密钥会得到同一段哈基咪语。");
      updateStats();
      return;
    }

    try {
      state.loading = true;
      setStatus("loading", "正在整理语序与密钥映射，请稍候。");
      const result = state.mode === "encode"
        ? encodeHajimi(text, keyInput.value)
        : decodeHajimi(text, keyInput.value);

      outputBox.value = result;
      state.output = result;
      state.lastUpdated = new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      setStatus("hint", `结果会自动更新，同输入和同密钥会得到同一段哈基咪语。最近更新于 ${state.lastUpdated}`);
      queueHistorySave();
    } catch (error) {
      outputBox.value = "";
      state.output = "";
      setStatus("error", error.message || "处理失败");
    } finally {
      state.loading = false;
      updateStats();
    }
  }

  function queueHistorySave() {
    clearTimeout(historyTimer);
    historyTimer = setTimeout(function () {
      const record = {
        id: String(Date.now()),
        mode: state.mode,
        input: inputBox.value,
        output: outputBox.value,
        key: keyInput.value,
        createdAt: new Date().toLocaleString("zh-CN")
      };

      const duplicate = state.history.find(function (item) {
        return item.mode === record.mode &&
          item.input === record.input &&
          item.output === record.output &&
          item.key === record.key;
      });

      if (duplicate || !record.input.trim() || !record.output.trim()) {
        return;
      }

      state.history = [record].concat(state.history).slice(0, 10);
      saveHistory();
      renderHistory();
    }, 1200);
  }

  function swapMode() {
    const currentInput = inputBox.value;
    inputBox.value = outputBox.value || currentInput;
    outputBox.value = currentInput && outputBox.value ? currentInput : "";
    state.mode = state.mode === "encode" ? "decode" : "encode";
    updateModeUI();
    updateStats();
    queueTranslate();
  }

  async function pasteInput() {
    try {
      inputBox.value = await navigator.clipboard.readText();
      queueTranslate();
      updateStats();
    } catch (error) {
      setStatus("error", "无法读取剪贴板，请检查浏览器权限。");
    }
  }

  async function copyOutput() {
    if (!outputBox.value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(outputBox.value);
      setStatus("hint", "结果已复制到剪贴板。");
    } catch (error) {
      setStatus("error", "复制失败，请检查浏览器权限。");
    }
  }

  function clearAll() {
    inputBox.value = "";
    outputBox.value = "";
    state.output = "";
    state.lastUpdated = "";
    updateStats();
    setStatus("hint", "结果会自动更新，同输入和同密钥会得到同一段哈基咪语。");
  }

  function clearHistory() {
    state.history = [];
    saveHistory();
    renderHistory();
  }

  function restoreHistory(id) {
    const item = state.history.find(function (record) {
      return record.id === id;
    });
    if (!item) {
      return;
    }
    state.mode = item.mode;
    inputBox.value = item.input;
    outputBox.value = item.output;
    keyInput.value = item.key;
    state.lastUpdated = item.createdAt;
    updateModeUI();
    updateStats();
    setStatus("hint", `已回填一条记录，保存时间 ${item.createdAt}`);
  }

  function removeHistory(id) {
    state.history = state.history.filter(function (item) {
      return item.id !== id;
    });
    saveHistory();
    renderHistory();
  }

  inputBox.addEventListener("input", function () {
    updateStats();
    queueTranslate();
  });

  keyInput.addEventListener("input", queueTranslate);
  swapButton.addEventListener("click", swapMode);
  pasteButton.addEventListener("click", pasteInput);
  clearButton.addEventListener("click", clearAll);
  copyButton.addEventListener("click", copyOutput);
  clearHistoryButton.addEventListener("click", clearHistory);

  historyList.addEventListener("click", function (event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.getAttribute("data-action");
    const id = target.getAttribute("data-id");

    if (!action || !id) {
      return;
    }

    if (action === "restore") {
      restoreHistory(id);
    } else if (action === "remove") {
      removeHistory(id);
    }
  });

  updateModeUI();
  updateStats();
  renderHistory();
})();
