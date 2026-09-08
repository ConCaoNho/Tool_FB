// ==================== 1. QUẢN LÝ DỮ LIỆU ====================
const likedUsers = new Map();     // profileUrl -> { name, profileUrl, reaction }
const commentsMap = new Map();    // key -> { name, profileUrl, commentText }

const IGNORE_TEXTS = [
  'all', 'tất cả', 'thích', 'like', 'yêu thích', 'love', 'thương thương', 'care',
  'haha', 'wow', 'buồn', 'sad', 'phẫn nộ', 'angry',
  'thêm bạn bè', 'add friend', 'bạn bè', 'friends', 'nhắn tin', 'message',
  'theo dõi', 'follow', 'đang theo dõi', 'following', 'gỡ', 'xóa', 'chỉnh sửa',
  'phản hồi', 'reply', 'chia sẻ', 'share', 'xem thêm', 'xem thêm bình luận', 'see more',
  'by author', 'bởi tác giả', 'loved by author', 'được thả tim bởi tác giả',
  'author', 'tác giả', 'top fan', 'fan cứng', 'người đóng góp hàng đầu', 'người hâm mộ hàng đầu',
  'indicator', 'active', 'online status', 'online status indicator', 'trạng thái hoạt động'
];

function isInvalidAuthorOrIndicator(text) {
  if (!text) return true;
  const lower = text.trim().toLowerCase();
  if (lower.length < 2) return true;
  if (IGNORE_TEXTS.includes(lower)) return true;
  if (/^(indicator|active|online|offline|status|presence|online status|active indicator|online status indicator|indicatoractive)$/i.test(lower)) return true;
  if (/^(hoạt động|đang hoạt động|trạng thái|trực tuyến|ảnh đại diện|avatar|profile picture)$/i.test(lower)) return true;
  if (/^(by author|bởi tác giả|loved by author|được thả tim bởi tác giả|author|tác giả|top fan|fan cứng|người hâm mộ hàng đầu|người đóng góp hàng đầu)$/i.test(lower)) return true;
  return false;
}

function cleanProfileUrl(href) {
  try {
    const fullUrl = href.startsWith('/') ? `https://www.facebook.com${href}` : href;
    const parsed = new URL(fullUrl);

    // Link trong group /groups/.../user/1000xxxx/
    const groupUserMatch = parsed.pathname.match(/\/groups\/[^/]+\/user\/(\d+)/);
    if (groupUserMatch) {
      return `https://www.facebook.com/profile.php?id=${groupUserMatch[1]}`;
    }

    // Link profile.php?id=...
    if (parsed.pathname.includes('profile.php')) {
      const id = parsed.searchParams.get('id');
      return `https://www.facebook.com/profile.php?id=${id}`;
    }

    return `https://www.facebook.com${parsed.pathname.replace(/\/+$/, '')}`;
  } catch (e) {
    return href;
  }
}

function isValidProfileLink(href, name) {
  if (!href || !name) return false;
  if (isInvalidAuthorOrIndicator(name)) return false;
  if (href.includes('/groups/') && !href.includes('/user/')) return false;

  const invalidKeywords = ['/hashtag/', '/posts/', '/photos/', '/videos/', '/watch/', '/permalink/', '/help/', '/messages/', '/browse/reactions/'];
  if (invalidKeywords.some(kw => href.includes(kw))) return false;

  return true;
}

function cleanAuthorName(linkElement) {
  if (!linkElement) return '';
  let name = (linkElement.innerText || linkElement.textContent || '').trim();
  if (!name) return '';

  name = name.split('\n')[0].trim();
  name = name
    .replace(/Online status indicatorActive/gi, '')
    .replace(/Online status indicator/gi, '')
    .replace(/indicatorActive/gi, '')
    .replace(/Online status/gi, '')
    .replace(/\bindicator\b/gi, '')
    .replace(/\bActive\b/gi, '')
    .replace(/[\u2022\u00b7•·|❤️]/g, ' ')
    .replace(/\b(Fan cứng|Người hâm mộ hàng đầu|Người đóng góp hàng đầu|Tác giả|Author|Top fan|Admin|Quản trị viên|Moderator|Người kiểm duyệt|by Author|bởi tác giả|loved by Author|được thả tim bởi tác giả|Online|Status|Presence|Hoạt động|Trực tuyến)\b/gi, '')
    .trim();

  if (isInvalidAuthorOrIndicator(name)) return '';

  return name;
}

function normalizeUrl(url) {
  if (!url) return '';
  return url.trim().toLowerCase().replace(/\/+$/, '');
}

// ==================== 2. LOGIC CẢM XÚC ====================
function isReactionDialog(dialog) {
  if (!dialog) return false;

  const hasCommentInput = dialog.querySelector('div[contenteditable="true"], [aria-label*="Viết bình luận"], [aria-label*="Write a comment"], [aria-label*="Comment as"]');
  if (hasCommentInput) return false;

  if (dialog.querySelector('[data-pagelet="MediaViewer"]')) return false;

  const ariaLabel = (dialog.getAttribute('aria-label') || '').toLowerCase();
  if (ariaLabel.includes('react') || ariaLabel.includes('cảm xúc') || ariaLabel.includes('bày tỏ') || ariaLabel.includes('people who')) {
    return true;
  }

  const text = dialog.innerText || '';
  const hasReactionTabs = /(All|Tất cả)/i.test(text) && /\d+/.test(text);
  const hasReactionElements = !!dialog.querySelector('[role="tablist"], [role="tab"], [role="listitem"]');

  return (hasReactionTabs && hasReactionElements) || /(^|\n)(All|Tất cả)(\n|$)/i.test(text);
}

function getReactionDialog() {
  const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
  for (let i = dialogs.length - 1; i >= 0; i--) {
    if (isReactionDialog(dialogs[i])) return dialogs[i];
  }
  return null;
}

function scanReactionModal() {
  const reactionDialog = getReactionDialog();
  if (!reactionDialog) return;

  const links = reactionDialog.querySelectorAll('a[role="link"], a[href]');
  links.forEach(link => {
    const href = link.getAttribute('href');
    const name = cleanAuthorName(link);
    if (!name || isInvalidAuthorOrIndicator(name)) return;
    if (!isValidProfileLink(href, name)) return;

    const profileUrl = cleanProfileUrl(href);
    let reaction = 'Thích';
    const row = link.closest('div[role="listitem"]') || link.parentElement?.parentElement?.parentElement?.parentElement;
    if (row) {
      const img = row.querySelector('img[alt], [aria-label], svg[aria-label]');
      if (img) {
        const label = img.getAttribute('alt') || img.getAttribute('aria-label');
        if (label && ['Thích', 'Yêu thích', 'Thương thương', 'Haha', 'Wow', 'Buồn', 'Phẫn nộ', 'Like', 'Love', 'Care', 'Sad', 'Angry'].some(r => label.includes(r))) {
          reaction = label;
        }
      }
    }

    if (!likedUsers.has(profileUrl)) {
      likedUsers.set(profileUrl, { name, profileUrl, reaction });
    }
  });
}

function exportLikesToExcel() {
  scanReactionModal();
  const list = Array.from(likedUsers.values());
  if (list.length === 0) {
    alert('Chưa có dữ liệu cảm xúc. Hãy mở danh sách người like và cuộn xuống nhé!');
    return;
  }

  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
      <style>
        br { mso-data-placement: same-cell; }
        th { background-color: #1877f2; color: #ffffff; font-weight: bold; border: 1px solid #ddd; padding: 8px; text-align: left; }
        td { border: 1px solid #ddd; padding: 6px; font-family: Arial, sans-serif; }
      </style>
    </head>
    <body>
      <table>
        <thead>
          <tr>
            <th style="width: 50px; text-align: center;">STT</th>
            <th style="width: 220px;">Họ Tên</th>
            <th style="width: 380px;">Link Trang Cá Nhân</th>
            <th style="width: 120px; text-align: center;">Cảm Xúc</th>
          </tr>
        </thead>
        <tbody>
  `;

  list.forEach((item, index) => {
    html += `
      <tr>
        <td style="text-align: center;">${index + 1}</td>
        <td>${item.name}</td>
        <td><a href="${item.profileUrl}">${item.profileUrl}</a></td>
        <td style="text-align: center;">${item.reaction}</td>
      </tr>
    `;
  });

  html += `</tbody></table></body></html>`;
  downloadExcelBlob(html, `fb_likes_${new Date().toISOString().slice(0, 10)}.xls`);
}

// ==================== 3. LOGIC BÌNH LUẬN ====================
function isRealCommentArticle(article) {
  if (!article) return false;

  // Nếu là bài viết chính trên Feed (chứa nhiều hơn 2 article con hoặc có data-pagelet feed), bỏ qua
  const childArticles = article.querySelectorAll('div[role="article"]');
  if (childArticles.length > 2) return false;
  if (article.getAttribute('data-pagelet')?.includes('FeedUnit')) return false;
  if (article.getAttribute('data-ad-preview')) return false;

  const ariaLabel = (article.getAttribute('aria-label') || '').toLowerCase();
  const hasCommentAria = ariaLabel.includes('comment') ||
    ariaLabel.includes('bình luận') ||
    ariaLabel.includes('reply') ||
    ariaLabel.includes('trả lời') ||
    ariaLabel.includes('phản hồi');

  const hasReplyBtn = Array.from(article.querySelectorAll('span, div[role="button"], a[role="button"]')).some(el => {
    const t = el.innerText?.trim().toLowerCase();
    return t === 'reply' || t === 'phản hồi' || t === 'trả lời' || t === 'like' || t === 'thích' || t === 'share' || t === 'chia sẻ' || (t && t.includes('repl'));
  });

  return hasCommentAria || hasReplyBtn || childArticles.length <= 2;
}

// Lấy các element con trực thuộc article này (không lấy các element nằm trong reply con)
function getDirectElements(parent, selector) {
  return Array.from(parent.querySelectorAll(selector)).filter(el => {
    let p = el.parentElement;
    while (p && p !== parent) {
      if (p.getAttribute('role') === 'article') return false;
      p = p.parentElement;
    }
    return true;
  });
}

function extractTagsFromComment(article, authorName, authorUrl, commentText) {
  const tags = [];
  const seen = new Set();

  function addTag(name) {
    if (!name) return;
    const clean = name.trim().replace(/^@+/, '').trim();
    const lower = clean.toLowerCase();
    if (!clean || clean.length < 2) return;
    if (authorName && lower === authorName.toLowerCase()) return;
    if (IGNORE_TEXTS.includes(lower)) return;
    if (seen.has(lower)) return;
    seen.add(lower);
    tags.push(clean);
  }

  // 1. Quét các thẻ <a> liên kết profile trong bình luận này (loại trừ các link trong reply con)
  if (article) {
    const directLinks = getDirectElements(article, 'a[role="link"], a[href]');
    directLinks.forEach(link => {
      const href = link.getAttribute('href');
      const name = cleanAuthorName(link);
      if (!name || isInvalidAuthorOrIndicator(name)) return;

      if (isValidProfileLink(href, name)) {
        const pUrl = cleanProfileUrl(href);
        if (normalizeUrl(pUrl) !== normalizeUrl(authorUrl)) {
          addTag(name);
        }
      }
    });
  }

  // 2. Quét thêm các tag dạng văn bản @Tên trong commentText nếu có
  if (commentText) {
    const mentionMatches = commentText.matchAll(/@([\p{L}\p{N}_\. ]{2,30})/gu);
    for (const match of mentionMatches) {
      if (match[1]) {
        const rawName = match[1].split(/[\n\r,\t!?:;]/)[0].trim();
        addTag(rawName);
      }
    }
  }

  return tags;
}

function extractCommentFullText(article, authorName) {
  const textContainers = getDirectElements(article, 'div[dir="auto"], span[dir="auto"]');
  const paragraphs = [];
  const seenTexts = new Set();

  for (const node of textContainers) {
    // Bỏ qua nếu node con nằm trong 1 node cha khác cũng có trong danh sách
    if (textContainers.some(other => other !== node && other.contains(node))) continue;

    const text = (node.innerText || '').trim();
    if (!text) continue;
    if (authorName && text.toLowerCase() === authorName.toLowerCase()) continue;
    if (isInvalidAuthorOrIndicator(text)) continue;
    if (/^\d+\s*(m|h|d|w|s|phút|giờ|ngày|tuần|giây)$/i.test(text)) continue;
    if (/^(Like|Thích|Reply|Phản hồi|Trả lời|Share|Chia sẻ|Edit|Chỉnh sửa|Delete|Xóa)$/i.test(text)) continue;

    if (!seenTexts.has(text)) {
      seenTexts.add(text);
      paragraphs.push(text);
    }
  }

  let fullText = paragraphs.join('\n').trim();

  // Nếu không tìm thấy text, kiểm tra xem có phải sticker / ảnh / video không
  if (!fullText) {
    if (article.querySelector('img[src*="sticker"], [aria-label*="nhãn dán"], [aria-label*="Sticker"]')) {
      fullText = '[Nhãn dán/Sticker]';
    } else if (article.querySelector('img[src*="safe_image"], img[alt*="photo"], [aria-label*="Ảnh"], [aria-label*="Photo"]')) {
      fullText = '[Hình ảnh]';
    } else if (article.querySelector('video, [aria-label*="GIF"]')) {
      fullText = '[GIF/Video]';
    }
  }

  return fullText;
}

function scanComments() {
  const articles = document.querySelectorAll('div[role="article"]');

  articles.forEach(article => {
    if (!isRealCommentArticle(article)) return;

    // Lấy các link profile trực tiếp của comment này (không lấy trong reply con)
    const directLinks = getDirectElements(article, 'a[role="link"], a[href]');
    let authorName = '';
    let authorUrl = '';

    for (const link of directLinks) {
      const href = link.getAttribute('href');
      const cleanName = cleanAuthorName(link);
      if (!cleanName || isInvalidAuthorOrIndicator(cleanName)) continue;

      if (isValidProfileLink(href, cleanName)) {
        authorName = cleanName;
        authorUrl = cleanProfileUrl(href);
        break;
      }
    }

    if (!authorName || !authorUrl) return;

    // Trích xuất toàn bộ nội dung bình luận (hỗ trợ cả bài viết nhiều đoạn)
    const commentText = extractCommentFullText(article, authorName);
    if (!commentText) return;

    // Trích xuất các tag bạn bè có trong bình luận
    const tags = extractTagsFromComment(article, authorName, authorUrl, commentText);
    const key = `${authorUrl}__${commentText.slice(0, 60)}`;

    if (!commentsMap.has(key)) {
      commentsMap.set(key, {
        name: authorName,
        profileUrl: authorUrl,
        commentText: commentText,
        tags: tags
      });
    } else {
      // Cập nhật bổ sung tags hoặc nội dung nếu lần quét sau đầy đủ hơn
      const existing = commentsMap.get(key);
      if (tags.length > (existing.tags?.length || 0)) {
        existing.tags = tags;
      }
      if (commentText.length > existing.commentText.length) {
        existing.commentText = commentText;
      }
    }
  });
}

function exportCommentsToExcel() {
  scanComments();
  const list = Array.from(commentsMap.values());
  if (list.length === 0) {
    alert('Chưa có dữ liệu bình luận. Hãy cuộn xem các bình luận của bài viết rồi bấm lại nhé!');
    return;
  }

  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
      <style>
        br { mso-data-placement: same-cell; }
        th { background-color: #42b72a; color: #ffffff; font-weight: bold; border: 1px solid #ddd; padding: 8px; text-align: left; }
        td { border: 1px solid #ddd; padding: 6px; font-family: Arial, sans-serif; }
      </style>
    </head>
    <body>
      <table>
        <thead>
          <tr>
            <th style="width: 50px; text-align: center;">STT</th>
            <th style="width: 200px;">Họ Tên Người Bình Luận</th>
            <th style="width: 320px;">Link Trang Cá Nhân</th>
            <th style="width: 80px; text-align: center;">Số Tag</th>
            <th style="width: 220px;">Bạn Bè Được Tag</th>
            <th style="width: 400px;">Nội Dung Bình Luận</th>
          </tr>
        </thead>
        <tbody>
  `;

  list.forEach((item, index) => {
    const safeText = item.commentText.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    const tagsList = item.tags || [];
    const safeTags = tagsList.join(', ').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    html += `
      <tr>
        <td style="text-align: center;">${index + 1}</td>
        <td>${item.name}</td>
        <td><a href="${item.profileUrl}">${item.profileUrl}</a></td>
        <td style="text-align: center;">${tagsList.length}</td>
        <td>${safeTags}</td>
        <td>${safeText}</td>
      </tr>
    `;
  });

  html += `</tbody></table></body></html>`;
  downloadExcelBlob(html, `fb_comments_${new Date().toISOString().slice(0, 10)}.xls`);
}

// ==================== 4. LOGIC MINIGAME, SỐ MAY MẮN & TAG BẠN BÈ ====================
function getUniqueCommentersList() {
  scanComments();
  const userCommentsMap = new Map();

  commentsMap.forEach((item) => {
    const normUrl = normalizeUrl(item.profileUrl);
    if (!userCommentsMap.has(normUrl)) {
      userCommentsMap.set(normUrl, {
        name: item.name,
        profileUrl: item.profileUrl,
        commentsList: []
      });
    }
    userCommentsMap.get(normUrl).commentsList.push({
      text: item.commentText,
      tags: item.tags || []
    });
  });

  return Array.from(userCommentsMap.values());
}

function extractNumbersFromText(text, digitsOption = 'any') {
  if (!text) return [];
  const rawMatches = text.match(/\d+/g) || [];
  const validNumbers = [];

  rawMatches.forEach(num => {
    if (num.length > 6) return;

    if (digitsOption === '2' && num.length !== 2) return;
    if (digitsOption === '3' && num.length !== 3) return;
    if (digitsOption === '4' && num.length !== 4) return;

    if (!validNumbers.includes(num)) {
      validNumbers.push(num);
    }
  });

  return validNumbers;
}

function getMinigameUsersList(reqLike = true, reqComment = true, reqLuckyNumber = false, digitsOption = 'any', reqTag = false, minTagCount = 2) {
  scanReactionModal();
  scanComments();

  // 1. Gom nhóm tất cả bình luận theo từng người chơi
  const userCommentsMap = new Map();
  commentsMap.forEach((item) => {
    const normUrl = normalizeUrl(item.profileUrl);
    if (!userCommentsMap.has(normUrl)) {
      userCommentsMap.set(normUrl, {
        name: item.name,
        profileUrl: item.profileUrl,
        commentsList: []
      });
    }
    userCommentsMap.get(normUrl).commentsList.push({
      text: item.commentText,
      tags: item.tags || []
    });
  });

  let rawCandidates = [];

  // 2. Ghép nối với danh sách Like nếu có yêu cầu Cảm xúc
  if (reqLike && (reqComment || reqLuckyNumber || reqTag)) {
    const processedNormUrls = new Set();

    likedUsers.forEach((liker) => {
      const normUrl = normalizeUrl(liker.profileUrl);
      const lowerName = (liker.name || '').toLowerCase().trim();

      let matchedCommenter = null;
      let matchedKey = null;

      if (userCommentsMap.has(normUrl)) {
        matchedCommenter = userCommentsMap.get(normUrl);
        matchedKey = normUrl;
      } else {
        // Ghép dự phòng theo tên
        for (const [cUrl, cUser] of userCommentsMap.entries()) {
          if ((cUser.name || '').toLowerCase().trim() === lowerName) {
            matchedCommenter = cUser;
            matchedKey = cUrl;
            break;
          }
        }
      }

      if (matchedCommenter && !processedNormUrls.has(matchedKey)) {
        processedNormUrls.add(matchedKey);
        rawCandidates.push({
          name: matchedCommenter.name,
          profileUrl: matchedCommenter.profileUrl,
          reaction: liker.reaction,
          commentsList: matchedCommenter.commentsList
        });
      }
    });
  } else if (reqLike) {
    rawCandidates = Array.from(likedUsers.values()).map(l => ({
      name: l.name,
      profileUrl: l.profileUrl,
      reaction: l.reaction,
      commentsList: []
    }));
  } else if (reqComment || reqLuckyNumber || reqTag) {
    rawCandidates = Array.from(userCommentsMap.values()).map(c => ({
      name: c.name,
      profileUrl: c.profileUrl,
      reaction: '',
      commentsList: c.commentsList
    }));
  }

  // 3. Xét từng bình luận riêng lẻ của mỗi người chơi
  // Mỗi người chỉ tính 1 bình luận duy nhất đủ tiêu chuẩn
  const validCandidates = [];

  rawCandidates.forEach(user => {
    if (!user.commentsList || user.commentsList.length === 0) {
      if (reqLike && !reqComment && !reqLuckyNumber && !reqTag) {
        validCandidates.push({
          name: user.name,
          profileUrl: user.profileUrl,
          reaction: user.reaction,
          commentCount: 0,
          validCommentText: '',
          luckyNumbers: [],
          tags: []
        });
      }
      return;
    }

    // Tìm các bình luận thỏa mãn TẤT CẢ các tiêu chuẩn đang bật
    const qualifyingComments = [];

    user.commentsList.forEach(cmt => {
      const cmtTags = cmt.tags || [];
      const cmtNumbers = extractNumbersFromText(cmt.text, digitsOption);

      const passTag = !reqTag || (cmtTags.length >= minTagCount);
      const passLuckyNumber = !reqLuckyNumber || (cmtNumbers.length > 0);

      if (passTag && passLuckyNumber) {
        qualifyingComments.push({
          text: cmt.text,
          tags: cmtTags,
          luckyNumbers: cmtNumbers
        });
      }
    });

    // Nếu người chơi có ít nhất 1 bình luận đạt chuẩn:
    if (qualifyingComments.length > 0) {
      // Chọn bình luận đạt chuẩn tốt nhất (ưu tiên số tag nhiều nhất hoặc cmt đầu tiên)
      const bestComment = qualifyingComments.reduce((best, curr) => (curr.tags.length > best.tags.length ? curr : best), qualifyingComments[0]);

      validCandidates.push({
        name: user.name,
        profileUrl: user.profileUrl,
        reaction: user.reaction || '',
        commentCount: user.commentsList.length,
        validCommentText: bestComment.text,
        luckyNumbers: bestComment.luckyNumbers,
        tags: bestComment.tags
      });
    }
  });

  return validCandidates;
}

function exportMinigameToExcel(reqLike = true, reqComment = true, reqLuckyNumber = false, digitsOption = 'any', reqTag = false, minTagCount = 2) {
  const list = getMinigameUsersList(reqLike, reqComment, reqLuckyNumber, digitsOption, reqTag, minTagCount);
  if (list.length === 0) {
    alert('Không tìm thấy người chơi nào thỏa mãn điều kiện!');
    return;
  }

  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
      <style>
        br { mso-data-placement: same-cell; }
        th { background-color: #6f42c1; color: #ffffff; font-weight: bold; padding: 8px; text-align: left; }
        td { border: 1px solid #ddd; padding: 6px; font-family: Arial, sans-serif; }
      </style>
    </head>
    <body>
      <table>
        <thead>
          <tr>
            <th style="width: 50px; text-align: center;">STT</th>
            <th style="width: 200px;">Họ Tên</th>
            <th style="width: 320px;">Link Trang Cá Nhân</th>
            ${reqLike ? '<th style="width: 100px; text-align: center;">Cảm Xúc</th>' : ''}
            ${reqLuckyNumber ? '<th style="width: 110px; text-align: center;">Số May Mắn</th>' : ''}
            ${reqTag ? '<th style="width: 80px; text-align: center;">Số Tag</th><th style="width: 250px;">Bạn Bè Được Tag</th>' : ''}
            <th style="width: 80px; text-align: center;">Tổng CMT</th>
            <th style="width: 400px;">Nội Dung Bình Luận Hợp Lệ</th>
          </tr>
        </thead>
        <tbody>
  `;

  list.forEach((item, index) => {
    const safeComment = (item.validCommentText || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    const safeTags = (item.tags || []).join(', ').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    html += `
      <tr>
        <td style="text-align: center;">${index + 1}</td>
        <td>${item.name}</td>
        <td><a href="${item.profileUrl}">${item.profileUrl}</a></td>
        ${reqLike ? `<td style="text-align: center;">${item.reaction || ''}</td>` : ''}
        ${reqLuckyNumber ? `<td style="text-align: center;">${(item.luckyNumbers || []).join(', ')}</td>` : ''}
        ${reqTag ? `<td style="text-align: center;">${(item.tags || []).length}</td><td>${safeTags}</td>` : ''}
        <td style="text-align: center;">${item.commentCount}</td>
        <td>${safeComment}</td>
      </tr>
    `;
  });

  html += `</tbody></table></body></html>`;
  downloadExcelBlob(html, `minigame_${new Date().toISOString().slice(0, 10)}.xls`);
}

function downloadExcelBlob(htmlContent, fileName) {
  const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ==================== 5. OBSERVER & MESSAGE LISTENER ====================
const observer = new MutationObserver(() => {
  scanReactionModal();
  scanComments();
});
observer.observe(document.body, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  scanReactionModal();
  scanComments();

  if (message.type === 'get-status') {
    const reqLike = message.reqLike !== undefined ? message.reqLike : true;
    const reqComment = message.reqComment !== undefined ? message.reqComment : true;
    const reqLuckyNumber = message.reqLuckyNumber !== undefined ? message.reqLuckyNumber : false;
    const digitsOption = message.digitsOption || 'any';
    const reqTag = message.reqTag !== undefined ? message.reqTag : false;
    const minTagCount = message.minTagCount || 2;

    const minigameList = getMinigameUsersList(reqLike, reqComment, reqLuckyNumber, digitsOption, reqTag, minTagCount);
    sendResponse({
      likeCount: likedUsers.size,
      commentCount: commentsMap.size,
      minigameValidCount: minigameList.length
    });
  } else if (message.type === 'export-likes') {
    exportLikesToExcel();
    sendResponse({ status: 'ok' });
  } else if (message.type === 'clear-likes') {
    likedUsers.clear();
    sendResponse({ likeCount: 0 });
  } else if (message.type === 'export-comments') {
    exportCommentsToExcel();
    sendResponse({ status: 'ok' });
  } else if (message.type === 'clear-comments') {
    commentsMap.clear();
    sendResponse({ commentCount: 0 });
  } else if (message.type === 'export-minigame' || message.type === 'export-both') {
    const reqLike = message.reqLike !== undefined ? message.reqLike : true;
    const reqComment = message.reqComment !== undefined ? message.reqComment : true;
    const reqLuckyNumber = message.reqLuckyNumber !== undefined ? message.reqLuckyNumber : false;
    const digitsOption = message.digitsOption || 'any';
    const reqTag = message.reqTag !== undefined ? message.reqTag : false;
    const minTagCount = message.minTagCount || 2;

    exportMinigameToExcel(reqLike, reqComment, reqLuckyNumber, digitsOption, reqTag, minTagCount);
    sendResponse({ status: 'ok' });
  }
  return true;
});
