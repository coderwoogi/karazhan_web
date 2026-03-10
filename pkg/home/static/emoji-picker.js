// Emoji Picker for TinyMCE Editor
const emojiCategories = {
    '😊 표정': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴'],
    '👋 제스처': ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
    '❤️ 하트': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'],
    '🎉 기타': ['🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '⭐', '🌟', '✨', '💫', '🔥', '💯', '✅', '❌', '⭕', '❓', '❗', '💬', '💭', '👍', '👎', '🙏', '💪', '🎯', '🎮', '🎵', '🎶']
};

let currentEmojiPicker = null;

function createEmojiPicker() {
    if (currentEmojiPicker) {
        return currentEmojiPicker;
    }

    const picker = document.createElement('div');
    picker.id = 'emoji-picker';
    picker.style.cssText = `
        position: absolute;
        bottom: 60px;
        right: 20px;
        width: 350px;
        max-height: 400px;
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.15);
        display: none;
        flex-direction: column;
        z-index: 10000;
    `;

    // Header with tabs
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        gap: 5px;
        padding: 10px;
        border-bottom: 1px solid #e2e8f0;
        overflow-x: auto;
    `;

    Object.keys(emojiCategories).forEach((category, index) => {
        const tab = document.createElement('button');
        tab.textContent = category.split(' ')[0];
        tab.style.cssText = `
            padding: 5px 10px;
            border: none;
            background: ${index === 0 ? '#3b82f6' : '#f1f5f9'};
            color: ${index === 0 ? 'white' : '#64748b'};
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
            transition: all 0.2s;
        `;
        tab.onclick = () => {
            document.querySelectorAll('#emoji-picker button').forEach(b => {
                b.style.background = '#f1f5f9';
                b.style.color = '#64748b';
            });
            tab.style.background = '#3b82f6';
            tab.style.color = 'white';
            showEmojiCategory(category);
        };
        header.appendChild(tab);
    });

    // Emoji grid
    const grid = document.createElement('div');
    grid.id = 'emoji-grid';
    grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 5px;
        padding: 10px;
        max-height: 300px;
        overflow-y: auto;
    `;

    picker.appendChild(header);
    picker.appendChild(grid);
    document.body.appendChild(picker);

    // Show first category by default
    showEmojiCategory(Object.keys(emojiCategories)[0]);

    currentEmojiPicker = picker;
    return picker;
}

function showEmojiCategory(category) {
    const grid = document.getElementById('emoji-grid');
    grid.innerHTML = '';

    emojiCategories[category].forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.style.cssText = `
            font-size: 24px;
            padding: 8px;
            border: none;
            background: transparent;
            cursor: pointer;
            border-radius: 6px;
            transition: background 0.2s;
        `;
        btn.onmouseover = () => btn.style.background = '#f1f5f9';
        btn.onmouseout = () => btn.style.background = 'transparent';
        btn.onclick = () => insertEmoji(emoji);
        grid.appendChild(btn);
    });
}

function insertEmoji(emoji) {
    if (tinyMCEInstance) {
        tinyMCEInstance.insertContent(emoji);
    }
    toggleEmojiPicker();
}

function toggleEmojiPicker() {
    const picker = createEmojiPicker();
    if (picker.style.display === 'none' || picker.style.display === '') {
        picker.style.display = 'flex';
    } else {
        picker.style.display = 'none';
    }
}

// Close emoji picker when clicking outside
document.addEventListener('click', function(e) {
    const picker = document.getElementById('emoji-picker');
    const emojiBtn = document.getElementById('emoji-btn');
    if (picker && emojiBtn && !picker.contains(e.target) && e.target !== emojiBtn) {
        picker.style.display = 'none';
    }
});
