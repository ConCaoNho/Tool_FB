const likeCountEl = document.getElementById('likeCount');
const exportLikesBtn = document.getElementById('exportLikesBtn');
const clearLikesBtn = document.getElementById('clearLikesBtn');

const commentCountEl = document.getElementById('commentCount');
const exportCommentsBtn = document.getElementById('exportCommentsBtn');
const clearCommentsBtn = document.getElementById('clearCommentsBtn');

const optReqLike = document.getElementById('optReqLike');
const optReqComment = document.getElementById('optReqComment');
const optReqLuckyNumber = document.getElementById('optReqLuckyNumber');
const numberOptionsRow = document.getElementById('numberOptionsRow');
const luckyNumberDigits = document.getElementById('luckyNumberDigits');
const optReqTag = document.getElementById('optReqTag');
const tagOptionsRow = document.getElementById('tagOptionsRow');
const tagCountSelect = document.getElementById('tagCountSelect');
const minigameCountEl = document.getElementById('minigameCount');
const exportMinigameBtn = document.getElementById('exportMinigameBtn');

const openStandaloneBtn = document.getElementById('openStandaloneBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

// Kiểm tra xem có đang chạy ở chế độ Cửa sổ riêng (Standalone Window) hay không
const isStandalone = window.location.search.includes('standalone=true');
if (isStandalone && openStandaloneBtn) {
  openStandaloneBtn.textContent = '📌 Cửa sổ riêng';
  openStandaloneBtn.disabled = true;
  openStandaloneBtn.style.opacity = '0.7';
  openStandaloneBtn.style.cursor = 'default';
}

if (openStandaloneBtn && !isStandalone) {
  openStandaloneBtn.onclick = () => {
    const width = 320;
    const height = 700;
    const left = Math.max(0, (window.screen.availWidth || 1200) - width - 30);
    const top = 50;

    chrome.windows.create({
      url: chrome.runtime.getURL('popup.html?standalone=true'),
      type: 'popup',
      width: width,
      height: height,
      left: left,
      top: top,
      focused: true
    });
    window.close(); // Đóng popup nhỏ trên thanh toolbar
  };
}

// Hàm tìm tab Facebook (hoạt động tốt ngay cả khi đang chuyển tab hoặc mở cửa sổ riêng)
async function getTargetFacebookTab() {
  // 1. Tìm tất cả tab Facebook đang mở
  const tabs = await chrome.tabs.query({ url: "*://*.facebook.com/*" });
  if (!tabs || tabs.length === 0) return null;

  // 2. Ưu tiên tab Facebook đang active trong cửa sổ chính
  const activeTab = tabs.find(t => t.active);
  if (activeTab) return activeTab;

  // 3. Hoặc lấy tab Facebook mở gần nhất
  return tabs[tabs.length - 1];
}

// Lắng nghe sự kiện thay đổi các tùy chọn
if (optReqLuckyNumber) {
  optReqLuckyNumber.onchange = () => {
    if (numberOptionsRow) {
      numberOptionsRow.style.display = optReqLuckyNumber.checked ? 'block' : 'none';
    }
    if (optReqLuckyNumber.checked && optReqComment && !optReqComment.checked) {
      optReqComment.checked = true;
    }
    refreshStatus();
  };
}

if (luckyNumberDigits) {
  luckyNumberDigits.onchange = () => refreshStatus();
}

if (optReqTag) {
  optReqTag.onchange = () => {
    if (tagOptionsRow) {
      tagOptionsRow.style.display = optReqTag.checked ? 'block' : 'none';
    }
    if (optReqTag.checked && optReqComment && !optReqComment.checked) {
      optReqComment.checked = true;
    }
    refreshStatus();
  };
}

if (tagCountSelect) {
  tagCountSelect.onchange = () => refreshStatus();
}

if (optReqLike) optReqLike.onchange = () => refreshStatus();
if (optReqComment) {
  optReqComment.onchange = () => {
    if (!optReqComment.checked) {
      if (optReqLuckyNumber && optReqLuckyNumber.checked) {
        optReqLuckyNumber.checked = false;
        if (numberOptionsRow) numberOptionsRow.style.display = 'none';
      }
      if (optReqTag && optReqTag.checked) {
        optReqTag.checked = false;
        if (tagOptionsRow) tagOptionsRow.style.display = 'none';
      }
    }
    refreshStatus();
  };
}

async function refreshStatus() {
  const tab = await getTargetFacebookTab();

  if (!tab || !tab.id) {
    if (statusDot) statusDot.className = 'status-dot disconnected';
    if (statusText) statusText.textContent = 'Chưa mở tab Facebook nào';
    exportLikesBtn.disabled = true;
    clearLikesBtn.disabled = true;
    exportCommentsBtn.disabled = true;
    clearCommentsBtn.disabled = true;
    if (exportMinigameBtn) exportMinigameBtn.disabled = true;
    return;
  }

  const reqLike = optReqLike ? optReqLike.checked : true;
  const reqComment = optReqComment ? optReqComment.checked : true;
  const reqLuckyNumber = optReqLuckyNumber ? optReqLuckyNumber.checked : false;
  const digitsOption = luckyNumberDigits ? luckyNumberDigits.value : 'any';
  const reqTag = optReqTag ? optReqTag.checked : false;
  const minTagCount = tagCountSelect ? (parseInt(tagCountSelect.value, 10) || 2) : 2;

  chrome.tabs.sendMessage(tab.id, {
    type: 'get-status',
    reqLike,
    reqComment,
    reqLuckyNumber,
    digitsOption,
    reqTag,
    minTagCount
  }, async (response) => {
    if (chrome.runtime.lastError || !response) {
      // Cố gắng tự động nạp lại content.js nếu tab chưa được F5 sau khi reload tiện ích
      try {
        if (chrome.scripting) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
        }
      } catch (e) {}

      if (statusDot) statusDot.className = 'status-dot disconnected';
      if (statusText) statusText.textContent = 'Hãy F5 lại tab Facebook nhé!';
      return;
    }

    if (statusDot) statusDot.className = 'status-dot';
    if (statusText) {
      const title = tab.title ? `FB: ${tab.title.slice(0, 18)}...` : 'Đã kết nối Facebook';
      statusText.textContent = title;
    }

    // Cập nhật Cảm xúc
    const likeCount = response.likeCount || 0;
    likeCountEl.textContent = likeCount;
    exportLikesBtn.disabled = likeCount === 0;
    clearLikesBtn.disabled = likeCount === 0;

    // Cập nhật Bình luận
    const commentCount = response.commentCount || 0;
    commentCountEl.textContent = commentCount;
    exportCommentsBtn.disabled = commentCount === 0;
    clearCommentsBtn.disabled = commentCount === 0;

    // Cập nhật Thẻ Yêu Cầu Minigame
    const validCount = response.minigameValidCount ?? 0;
    if (minigameCountEl) minigameCountEl.textContent = validCount;
    if (exportMinigameBtn) {
      exportMinigameBtn.disabled = validCount === 0 || (!reqLike && !reqComment && !reqLuckyNumber && !reqTag);
    }
  });
}

// Xử lý nút Cảm Xúc
exportLikesBtn.onclick = async () => {
  const tab = await getTargetFacebookTab();
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'export-likes' });
};

clearLikesBtn.onclick = async () => {
  const tab = await getTargetFacebookTab();
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'clear-likes' }, () => refreshStatus());
  }
};

// Xử lý nút Bình Luận
exportCommentsBtn.onclick = async () => {
  const tab = await getTargetFacebookTab();
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'export-comments' });
};

clearCommentsBtn.onclick = async () => {
  const tab = await getTargetFacebookTab();
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'clear-comments' }, () => refreshStatus());
  }
};

// Xử lý nút Xuất Excel Minigame
if (exportMinigameBtn) {
  exportMinigameBtn.onclick = async () => {
    const tab = await getTargetFacebookTab();
    const reqLike = optReqLike ? optReqLike.checked : true;
    const reqComment = optReqComment ? optReqComment.checked : true;
    const reqLuckyNumber = optReqLuckyNumber ? optReqLuckyNumber.checked : false;
    const digitsOption = luckyNumberDigits ? luckyNumberDigits.value : 'any';
    const reqTag = optReqTag ? optReqTag.checked : false;
    const minTagCount = tagCountSelect ? (parseInt(tagCountSelect.value, 10) || 2) : 2;

    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'export-minigame',
        reqLike,
        reqComment,
        reqLuckyNumber,
        digitsOption,
        reqTag,
        minTagCount
      });
    }
  };
}

refreshStatus();
setInterval(refreshStatus, 800);