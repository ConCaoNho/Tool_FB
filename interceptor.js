(() => {
  if (window.__fbLikeExporterInstalled) return;
  window.__fbLikeExporterInstalled = true;

  const originalFetch = window.fetch;
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  window.likedUsersMap = window.likedUsersMap || new Map();

  const REACTION_MAP = {
    'LIKE': 'Thích',
    'LOVE': 'Yêu thích',
    'CARE': 'Thương thương',
    'HAHA': 'Haha',
    'WOW': 'Wow',
    'SAD': 'Buồn',
    'ANGRY': 'Phẫn nộ',
    1: 'Thích',
    2: 'Yêu thích',
    3: 'Wow',
    4: 'Haha',
    7: 'Buồn',
    8: 'Phẫn nộ',
    16: 'Thương thương'
  };

  function notifyContentScript() {
    window.dispatchEvent(new CustomEvent('likeExporterUpdate', {
      detail: { size: window.likedUsersMap.size }
    }));
  }

  function walkObject(value, visitor) {
    if (!value || typeof value !== 'object') return;
    visitor(value);
    if (Array.isArray(value)) {
      value.forEach(item => walkObject(item, visitor));
      return;
    }
    Object.values(value).forEach(item => walkObject(item, visitor));
  }

  function extractLikesFromPayload(payload) {
    let found = false;

    walkObject(payload, (node) => {
      if (!node || typeof node !== 'object') return;

      // Facebook User Node trong GraphQL
      const userNode = node.node || node.actor || (node.__typename === 'User' ? node : null);
      if (!userNode) return;

      const id = userNode.id;
      const name = userNode.name;

      if (id && name && /^\d{4,}$/.test(String(id))) {
        const reactionRaw = node.reaction_type || node.localized_name || 'LIKE';
        const reaction = REACTION_MAP[reactionRaw] || reactionRaw || 'Thích';
        const profileUrl = userNode.url || userNode.profile_url || `https://www.facebook.com/${id}`;

        if (!window.likedUsersMap.has(String(id))) {
          window.likedUsersMap.set(String(id), {
            id: String(id),
            name: name,
            profileUrl: profileUrl,
            reaction: reaction
          });
          found = true;
        }
      }
    });

    if (found) {
      console.log(`[Like Exporter] Đã thu thập: ${window.likedUsersMap.size} lượt react`);
      notifyContentScript();
    }
  }

  function cleanAndParseJson(rawText) {
    if (!rawText || typeof rawText !== 'string') return;

    // Loại bỏ tiền tố for (;;); của Facebook
    let text = rawText.replace(/^for\s*\(\s*;\s*;\s*\);\s*/, '').trim();

    // Xử lý Facebook streaming newline delimited JSON
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        extractLikesFromPayload(parsed);
      } catch (e) {
        // Dự phòng: Match object JSON bên trong
        const match = trimmed.match(/\{"data":[\s\S]*\}/);
        if (match) {
          try {
            extractLikesFromPayload(JSON.parse(match[0]));
          } catch (_) {}
        }
      }
    }
  }

  // Intercept Fetch
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const clone = response.clone();
      clone.text().then(cleanAndParseJson).catch(() => {});
    } catch (e) {}
    return response;
  };

  // Intercept XHR
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    return originalXhrOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(body) {
    this.addEventListener('load', function() {
      try {
        const type = this.responseType;
        if (type === '' || type === 'text') {
          cleanAndParseJson(this.responseText);
        }
      } catch (error) {}
    });
    return originalXhrSend.apply(this, [body]);
  };

  // Xử lý sự kiện export/clear từ popup/content script
  window.addEventListener('likeExporterAction', (e) => {
    const action = e.detail?.action;
    if (action === 'export') {
      const list = Array.from(window.likedUsersMap.values());
      if (list.length === 0) {
        alert('Chưa có dữ liệu người like. Hãy mở popup danh sách like trên bài viết và cuộn xuống.');
        return;
      }

      const header = ['ID Facebook', 'Họ Tên', 'Link Trang Cá Nhân', 'Loại Cảm Xúc'];
      const rows = list.map((item) => [
        item.id,
        `"${String(item.name).replace(/"/g, '""')}"`,
        item.profileUrl,
        item.reaction
      ]);

      const csvContent = "\ufeff" + [header, ...rows].map(row => row.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `fb_likes_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } else if (action === 'clear') {
      window.likedUsersMap.clear();
      notifyContentScript();
    } else if (action === 'query') {
      notifyContentScript();
    }
  });

  console.log('[Like Exporter] Interceptor đã sẵn sàng.');
})();