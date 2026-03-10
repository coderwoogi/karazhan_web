
// Appended Functions for Character Selection

async function loadUserCharactersForSelection(containerId) {
    const container = document.getElementById(containerId);
    if(!container) return;
    
    container.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
        const res = await fetch('/api/user/characters?limit=50'); 
        if(res.ok) {
            const data = await res.json();
            const chars = data.characters || [];
            
            if(chars.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding:10px;">캐릭터가 없습니다.</div>';
                return;
            }

            container.innerHTML = chars.map(c => {
                const genderStr = c.gender === 0 ? 'male' : 'female';
                return `
                <div class="char-select-item" onclick="selectMainChar('${c.guid}', '${escapeHtml(c.name)}')" 
                     style="display:flex; align-items:center; gap:10px; padding:10px; border-bottom:1px solid #eee; cursor:pointer;">
                    <img src="/img/icons/race_${c.race}_${genderStr}.gif" onerror="this.src='/img/icons/race_1_male.gif'" style="width:24px; height:24px;">
                    <img src="/img/icons/class_${c.class}.gif" onerror="this.src='/img/icons/class_1.gif'" style="width:24px; height:24px;">
                    <div style="flex:1;">
                        <div style="font-weight:bold;">${escapeHtml(c.name)}</div>
                        <div style="font-size:0.8rem; color:#666;">Lv.${c.level}</div>
                    </div>
                </div>
                `;
            }).join('');
            
        } else {
            container.innerHTML = '<div style="text-align:center; color:red;">불러오기 실패</div>';
        }
    } catch(e) { 
        console.error("loadUserCharactersForSelection failed", e);
        container.innerHTML = '<div style="text-align:center; color:red;">오류 발생</div>';
    }
}

function selectMainChar(guid, name) {
     console.log("Selecting main char:", guid, name);
     fetch('/api/user/mainconf', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ guid: parseInt(guid) })
    }).then(res => {
        if(res.ok) location.reload();
        else alert('설정 실패');
    });
}
window.loadUserCharactersForSelection = loadUserCharactersForSelection;
window.selectMainChar = selectMainChar;
