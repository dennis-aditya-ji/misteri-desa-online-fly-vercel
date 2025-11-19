// public/scripts/client.js - KODE FINAL LENGKAP V4.0 (DENGAN SOUND BARU & ANIMASI)

// --- KONEKSI (PERUBAHAN KRUSIAL UNTUK ONLINE) ---
const SERVER_URL = ""; 
const socket = io(SERVER_URL, {
    reconnection: true,             
    reconnectionAttempts: Infinity, 
    reconnectionDelay: 1000         
});  

// --- DEKLARASI ELEMEN ---
const gameContainer = document.getElementById('game-container');
const roleCardDisplay = document.getElementById('role-card-display'); 
const nameModal = document.getElementById('name-modal');
const nameForm = document.getElementById('name-form');
const nicknameInput = document.getElementById('nickname-input');
const lobbyScreen = document.getElementById('lobby-screen');
const roomScreen = document.getElementById('room-screen'); 
const createDesaFormArea = document.getElementById('create-desa-form-area');
const newDesaNameInput = document.getElementById('new-desa-name');
const activeDesasList = document.getElementById('active-desas-list');
const lobbyNicknameDisplay = document.getElementById('lobby-nickname-display');
const currentDesaDisplay = document.getElementById('current-desa');
const playerCountDisplay = document.getElementById('player-count');
const desaPlayerList = document.getElementById('desa-player-list');
const creatorDisplay = document.getElementById('creator-display');
const startGameBtn = document.getElementById('start-game-btn'); 
const cycleStatusDisplay = document.getElementById('cycle-status-display'); 
const form = document.getElementById('form');
const input = document.getElementById('m');
const messages = document.getElementById('messages');
const nightActionScreen = document.getElementById('night-action-screen'); 
const nightActionContent = document.getElementById('night-action-content');
const votingScreen = document.getElementById('voting-screen');
const votingContent = document.getElementById('voting-content');
const showTutorialBtn = document.getElementById('show-tutorial-btn');
const tutorialModal = document.getElementById('tutorial-modal');
const closeTutorialBtn = document.getElementById('close-tutorial-btn');
const tutorialContent = document.getElementById('tutorial-content');


// --- VARIBEL KLIEN LOKAL & SOUND EFFECTS (DIPERBARUI TOTAL) ---
let myRole = {}; 
let playersInRoom = [];
let isDead = false; 

// AUDIO DASAR (dari list user)
const audioDay = new Audio('sounds/135925__felixblume__rooster-donkey-dogs-and-birds-at-the-morning-in-the-small-village-of-la-preciosita-in-the-mexican-countryside.mp3');
const audioNight = new Audio('sounds/640986__beautifuldaymonster1968__the-classic-wolf-tv-howl.mp3');
const sfxConfirm = new Audio('sounds/270537__littlerobotsoundfactory__menu_select_00.mp3');
const sfxCancel = new Audio('sounds/140465__afleetingspeck__packaging-paper-wobble-failed-attempt.mp3');
const sfxTransition = new Audio('sounds/50881__gabemiller74__werewolf.mp3'); 
const sfxDeath = new Audio('sounds/214084__vote4banan__help.mp3'); 

// AUDIO TAMBAHAN FUN & JUICY (Placeholder - Harus dicari sendiri)
const sfxRoleReveal = new Audio('sounds/sfx_role_reveal.mp3'); 
const sfxTada = new Audio('sounds/sfx_tada.mp3'); 
const sfxKnock = new Audio('sounds/sfx_knock_knock.mp3'); // Dipakai saat malam dimulai
const sfxClick = new Audio('sounds/707041__vilkas_sound__vs-button-click-04.mp3'); // Dipakai untuk klik non-game (lobby, tutorial, dll)
const sfxDingDong = new Audio('sounds/sfx_ding_dong.mp3'); // Dipakai saat pengumuman pagi

function playSound(audioElement) {
    if (!audioElement) return;
    audioElement.currentTime = 0; 
    audioElement.volume = 0.5; 
    audioElement.play().catch(e => console.warn("Gagal memutar suara:", e.message));
}

// --- LOGIKA UTAMA CLIENT ---

// Handle Form Chat
form.addEventListener('submit', function(e) {
    e.preventDefault(); 
    if (input.value && !isDead) { 
        socket.emit('desa message', input.value); 
        input.value = ''; 
    }
});

// Update Daftar Pemain di Desa
socket.on('desa players update', (playersInDesa, creatorId) => {
    playersInRoom = playersInDesa; 
    let listText = 'Warga: ';
    let creatorName = 'Tidak Ada';
    let isCreator = false;

    playersInDesa.forEach(p => {
        const creatorMark = p.id === creatorId ? ' (Tetua)' : '';
        const deadMark = p.isDead ? '💀' : '';
        listText += `${deadMark} ${p.name}${creatorMark}, `;
        
        if (p.id === creatorId) { creatorName = p.name; }
        if (p.id === socket.id) { 
            isCreator = (p.id === creatorId);
            isDead = p.isDead; // UPDATE STATUS ISDEAD
        }
    });

    // Logika Mode Penonton
    if (isDead) {
        input.placeholder = "Anda sudah meninggal 👻. Hanya bisa menonton.";
        input.disabled = true;
        form.querySelector('button').disabled = true;
    } else {
        input.placeholder = "Ketik disini...";
        input.disabled = false;
        form.querySelector('button').disabled = false;
    }

    desaPlayerList.textContent = listText.slice(0, -2);
    creatorDisplay.textContent = `Tetua Desa: ${creatorName}`;
    startGameBtn.style.display = isCreator && !isDead ? 'block' : 'none';
    startGameBtn.disabled = playersInDesa.length < 4; 
});


// 1. GAME STARTED (SOUND)
socket.on('game started', () => {
    playSound(sfxTransition); 
});

// 2. KARTU PERAN (SFX BARU)
socket.on('your role', (roleData) => {
    myRole = roleData; 
    playSound(sfxRoleReveal); // SFX BARU: Peran Muncul
    const teamColor = roleData.team === 'Penghasut' ? '#FF6F61' : '#004d40';
    roleCardDisplay.innerHTML = `<div class="role-card" style="border-left: 5px solid ${teamColor};"><h2 style="color: ${teamColor};">Peran Anda: ${roleData.name}</h2><p><strong>Tim:</strong> ${roleData.team}</p><p>${roleData.desc} ${roleData.vigilanteBullets !== undefined ? `(Peluru Tersisa: ${roleData.vigilanteBullets})` : ''}</p><button onclick="document.getElementById('role-card-display').style.display='none'">Pahami Peran Saya</button></div>`;
    roleCardDisplay.style.display = 'flex'; 
});

// 3. SOUND EFFECTS FASE BARU (SFX BARU)
socket.on('new phase', (phaseName) => {
    if (phaseName === 'NIGHT') {
        playSound(sfxKnock); // SFX BARU: Ketukan sebelum malam
        playSound(audioNight);
    } else if (phaseName === 'DAY') {
        playSound(sfxDingDong); // SFX BARU: Pengumuman pagi
        playSound(audioDay);
    } else if (phaseName === 'VOTING') {
        playSound(sfxTransition); 
    }
});

// 4. MENERIMA UPDATE FASE & TIMER (ANIMASI BARU)
socket.on('phase update', (data) => {
    const min = Math.floor(data.timer / 60);
    const sec = data.timer % 60;
    const timerStr = `${min}:${sec < 10 ? '0' : ''}${sec}`;
    
    if (isDead) {
        nightActionScreen.style.display = 'none';
        votingScreen.style.display = 'none';
        cycleStatusDisplay.innerHTML = `Hari ${data.day} | ${data.phase} | Waktu: <strong>${timerStr}</strong> 👻 PENONTON`;
        cycleStatusDisplay.classList.remove('timer-warning'); // Hapus jika penonton
        return; 
    }

    cycleStatusDisplay.innerHTML = `Hari ${data.day} | ${data.phase} | Waktu: <strong>${timerStr}</strong>`;
    
    // LOGIKA ANIMASI TIMER WARNING (BARU)
    if (data.timer <= 30 && data.timer > 0) {
        cycleStatusDisplay.classList.add('timer-warning');
    } else {
        cycleStatusDisplay.classList.remove('timer-warning');
    }
});

// 5. MENERIMA PERINTAH AKSI MALAM/VOTING
socket.on('show night action', (data) => {
    if (isDead) return;
    nightActionScreen.style.display = 'flex';
    votingScreen.style.display = 'none';
    renderNightActionUI(data);
});

socket.on('show voting', () => {
    if (isDead) return;
    nightActionScreen.style.display = 'none';
    votingScreen.style.display = 'flex';
    renderVotingUI();
});

// 6. MENERIMA HASIL GAME (SFX BARU)
socket.on('game over', (data) => {
    // 1. Buat Daftar Pemain dalam bentuk HTML
    let playerListHTML = '<h3>Peran Semua Pemain:</h3><ul style="list-style:none; padding: 0;">';
    data.allPlayers.forEach(p => {
        const teamColor = p.team === 'Penghasut' ? '#FF6F61' : '#4caf50'; 
        playerListHTML += `<li style="margin-bottom: 5px; text-align: left; border-left: 3px solid ${teamColor}; padding-left: 5px;">${p.name} - <strong>${p.role}</strong> <span style="color: ${teamColor}">(${p.team})</span></li>`;
    });
    playerListHTML += '</ul>';

    // 2. Buat Card Pop-up
    const overlay = document.createElement('div');
    overlay.className = 'game-over-overlay';

    const card = document.createElement('div');
    card.className = 'game-over-card';

    const htmlContent = `
        <h2>GAME OVER!</h2>
        <p>Pemenang: <strong>${data.winner}</strong></p>
        <p>${data.message}</p>
        ${playerListHTML}
        <button onclick="window.location.reload()">Selesai / Main Lagi</button>
    `;

    card.innerHTML = htmlContent;
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    roomScreen.style.display = 'none'; // Sembunyikan room utama
    isDead = false; 
});


// 7. CHAT MESSAGE DAN DETEKSI KEMATIAN
socket.on('chat message', function(msg) {
    const item = Object.assign(document.createElement('li'), { innerHTML: msg }); 
    messages.appendChild(item); 
    messages.scrollTop = messages.scrollHeight; 
    
    if (msg.includes('dieksekusi') || msg.includes('ditemukan mayat') || msg.includes('menembak mati')) {
        playSound(sfxDeath);
    }
});

// 8. FUNGSI RENDERING AKSI MALAM (Tidak Ada Perubahan Logika)
function renderNightActionUI(data) {
    const aliveTargets = playersInRoom.filter(p => !p.isDead && p.id !== socket.id); 
    
    let actionTitle = `Aksi Malam: ${data.role}`;
    let actionDesc = 'Pilih satu Warga Desa untuk melakukan aksi Anda malam ini.';
    let actionType = myRole.actionType;
    
    if (actionType === 'shoot') {
        actionTitle += ` (Peluru: ${data.bullets})`;
        if (data.bullets <= 0) {
            nightActionContent.innerHTML = '<h2>Anda sudah kehabisan peluru. Tidurlah.</h2><button onclick="nightActionScreen.style.display=\'none\'">Tutup</button>';
            return;
        }
    }
    
    let html = `<h2>🌑 ${actionTitle}</h2><p>${actionDesc}</p><div class="action-list">`;
    
    aliveTargets.forEach(player => {
        html += `<button class="action-target-btn vote-target-btn" data-id="${player.id}">${player.name}</button>`;
    });

    html += '</div>';
    nightActionContent.innerHTML = html;

    document.querySelectorAll('.action-target-btn').forEach(button => {
        button.addEventListener('click', function() {
            playSound(sfxConfirm); 
            const targetId = this.getAttribute('data-id');
            socket.emit('night action', targetId);
            document.querySelectorAll('.action-target-btn').forEach(btn => btn.disabled = true);
            nightActionContent.innerHTML = '<h2 style="color: #004d40;">Aksi dikonfirmasi. Menunggu fajar...</h2><button onclick="nightActionScreen.style.display=\'none\'">Tutup</button>';
        });
    });
}

// 9. FUNGSI RENDERING VOTING (Tidak Ada Perubahan Logika)
function renderVotingUI() {
    const alivePlayers = playersInRoom.filter(p => !p.isDead); 
    
    let html = '<h2>🗳️ Siapa Penghasut Desa?</h2>';
    html += '<p>Pilih satu Warga Desa yang menurut Anda harus dieksekusi hari ini.</p>';
    html += '<div class="action-list">';
    
    html += `<button class="vote-target-btn skip-vote" data-id="">LEWATKAN VOTING</button>`;
    
    alivePlayers.forEach(player => {
        if (player.id !== socket.id) { 
            html += `<button class="vote-target-btn" data-id="${player.id}">${player.name}</button>`;
        }
    });

    html += '</div>';
    votingContent.innerHTML = html;

    document.querySelectorAll('.vote-target-btn').forEach(button => {
        button.addEventListener('click', function() {
            const targetId = this.getAttribute('data-id'); 
            
            if (targetId === "") {
                playSound(sfxCancel); 
            } else {
                 playSound(sfxConfirm); 
            }
            
            socket.emit('submit vote', targetId);
            
            document.querySelectorAll('.vote-target-btn').forEach(btn => btn.disabled = true);
            votingContent.innerHTML = '<h2 style="color: #004d40;">Anda sudah memilih. Menunggu Warga lain...</h2><button onclick="votingScreen.style.display=\'none\'">Tutup</button>';
        });
    });
}

// --- LOGIKA KONEKSI & LOBBY (FINAL) ---

// 10. Pendaftaran Nama (SFX BARU)
nameForm.addEventListener('submit', function(e) {
    e.preventDefault();
    if (nicknameInput.value) {
        playSound(sfxClick); // SFX BARU: Klik Gabung
        socket.emit('register user', nicknameInput.value);
    }
});

socket.on('registration complete', (name) => {
    nameModal.style.display = 'none';
    gameContainer.style.display = 'flex';
    lobbyNicknameDisplay.textContent = `Anda: ${name}`;
});

// 11. Daftar Desa
socket.on('desas list update', (desas) => {
    activeDesasList.innerHTML = '';
    if (desas.length === 0) {
        activeDesasList.innerHTML = '<li>Belum ada desa yang dibangun. Jadilah Tetua Desa!</li>';
        return;
    }

    desas.forEach(desa => {
        const item = document.createElement('li');
        const statusText = desa.status === 'playing' ? ' (BERMAIN)' : '';
        const statusClass = desa.status === 'playing' ? 'playing' : 'lobby';
        
        item.innerHTML = `
            <strong>${desa.name}</strong> 
            <span class="${statusClass}">${statusText}</span> 
            <span style="float: right;">(${desa.playerCount} Warga)</span>
            `;
        
        if (desa.status === 'lobby') {
            const joinBtn = document.createElement('button');
            joinBtn.textContent = 'Gabung';
            joinBtn.classList.add('join-btn');
            joinBtn.addEventListener('click', () => {
                playSound(sfxClick); // SFX BARU: Klik Gabung
                socket.emit('join desa', desa.name);
            });
            item.appendChild(joinBtn);
        }
        activeDesasList.appendChild(item);
    });
});

// 12. Membuat Desa (SFX BARU)
createDesaFormArea.addEventListener('submit', function(e) {
    e.preventDefault();
    if (newDesaNameInput.value) {
        playSound(sfxClick); // SFX BARU: Klik Buat
        socket.emit('create desa', newDesaNameInput.value);
        newDesaNameInput.value = '';
    }
});

// 13. Menerima Konfirmasi Gabung/Buat Desa (Tidak ada perubahan)
socket.on('desa joined', (desaName) => {
    currentDesaDisplay.textContent = desaName;
    lobbyScreen.style.display = 'none';
    roomScreen.style.display = 'flex';
    messages.innerHTML = ''; 
});

// 14. Menerima Notifikasi Error (Tidak ada perubahan)
socket.on('desa error', (msg) => {
    alert(msg);
});

// 15. Menerima Update Warga Online Global (Tidak ada perubahan)
socket.on('player count update', (count) => {
    playerCountDisplay.textContent = `${count} Warga Online`;
});

// 16. Tombol Mulai Game (Tidak ada perubahan)
startGameBtn.addEventListener('click', function() {
    if (startGameBtn.disabled) return;
    socket.emit('start game');
    startGameBtn.disabled = true;
    startGameBtn.textContent = 'Memulai...';
});


// 17. LOGIKA TUTORIAL MODAL (SFX BARU)
showTutorialBtn.addEventListener('click', function() {
    playSound(sfxClick); // SFX BARU: Klik Tutorial
    tutorialModal.style.display = 'flex';
    tutorialContent.innerHTML = renderTutorialContent();
});

closeTutorialBtn.addEventListener('click', function() {
    playSound(sfxClick); // SFX BARU: Klik Tutup
    tutorialModal.style.display = 'none';
});

// Fungsi untuk membuat konten tutorial (Tidak ada perubahan)
function renderTutorialContent() {
    const ROLES_DATA = [
        { name: "Penghasut Desa", team: "Penghasut", action: "Malam: Membunuh 1 Warga." },
        { name: "Pak RT", team: "Warga", action: "Malam: Mengintip (Peek) tim 1 Warga." },
        { name: "Dokter Polindes", team: "Warga", action: "Malam: Melindungi (Save) 1 Warga." },
        { name: "Pensiunan Tentara", team: "Warga", action: "Malam: Menembak (Shoot) 1 Warga (2x peluru)." },
        { name: "Hansip Desa", team: "Warga", action: "Pasif: Jika dibunuh Penghasut malam hari, otomatis membunuh Penghasut." },
        { name: "Penjual Kopi", team: "Warga", action: "Pasif: Jika dibunuh Penghasut malam hari, Warga tahu pelakunya Penghasut." },
        { name: "Warga Desa", team: "Warga", action: "Tidak ada aksi malam." }
    ];

    let rolesHtml = ROLES_DATA.map(role => `
        <div class="role-desc-item">
            <h3 style="color: ${role.team === 'Penghasut' ? '#FF6F61' : '#004d40'};">${role.name} (${role.team})</h3>
            <p><strong>Aksi:</strong> ${role.action}</p>
        </div>
    `).join('');

    return `
        <p><strong>Tujuan Utama:</strong></p>
        <ul>
            <li><strong>Tim Warga:</strong> Mengeksekusi semua Penghasut.</li>
            <li><strong>Tim Penghasut:</strong> Membuat jumlah Penghasut sama dengan atau lebih banyak dari Warga yang masih hidup.</li>
        </ul>
        
        <h3>Siklus Permainan</h3>
        <ol>
            <li><strong>Malam:</strong> Semua peran khusus (Penghasut, Dokter, Pak RT, Pensiunan Tentara) melakukan aksinya secara rahasia.</li>
            <li><strong>Pagi:</strong> Narator mengumumkan korban Malam. Debat dimulai.</li>
            <li><strong>Voting:</strong> Warga memilih 1 orang yang dicurigai untuk dieksekusi. Jika ada tie, tidak ada yang mati.</li>
        </ol>

        <h3>Daftar Peran Khusus</h3>
        ${rolesHtml}
        
        <p style="margin-top: 20px;">Permainan membutuhkan minimal 4 pemain untuk dimulai.</p>
    `;

}
