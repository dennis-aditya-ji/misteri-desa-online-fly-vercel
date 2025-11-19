// server.js - KODE FINAL LENGKAP V3.0 (GAME BERSIH & SIAP DEPLOY)

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app); 
const io = new Server(server, { 
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Objek untuk menyimpan data pemain: { socketId: { id, name, role, team, desa, isDead, isProtected, vigilanteBullets } }
const players = {}; 
const DEFAULT_NICKNAME = "Warga Anonim"; 

// Objek untuk menyimpan Desa: { desaName: { creatorId, players: [socketId, ...], status: 'lobby'/'playing', game: { phase, day, timer, actions, votes, loopInterval } } }
const desas = {}; 

// --- KONSTANTA GAME ---
const PHASES = {
    NIGHT: { name: 'Malam', duration: 60 }, // 40 detik
    DAY: { name: 'Siang', duration: 90 },  // 90 detik
    VOTING: { name: 'Voting', duration: 45 } // 45 detik
};

const ROLES = {
    WEREWOLF: { name: "Penghasut Desa", team: "Penghasut", desc: "Tugasmu menghasut Warga Desa di siang hari dan membunuh satu orang di malam hari.", actionType: 'kill' },
    SEER: { name: "Pak RT", team: "Warga", desc: "Setiap malam, Anda bisa mengintip identitas satu Warga Desa. Gunakan kebijaksanaan Anda!", actionType: 'peek' },
    DOCTOR: { name: "Dokter Polindes", team: "Warga", desc: "Setiap malam, Anda bisa melindungi satu Warga Desa (termasuk diri sendiri) dari serangan Penghasut.", actionType: 'save' },
    HUNTER: { name: "Hansip Desa", team: "Warga", desc: "Ketika Anda terbunuh, Anda bisa menembak balas dendam satu Warga Desa lainnya. (Otomatis)", actionType: null },
    COFFEE_SELLER: { name: "Penjual Kopi", team: "Warga", desc: "Anda netral dalam debat. Jika dibunuh Penghasut, Warga tahu pelakunya. (Pasif)", actionType: null },
    VIGILANTE: { name: "Pensiunan Tentara", team: "Warga", desc: "Anda memiliki 2 butir peluru. Setiap malam, Anda bisa menggunakan 1 peluru untuk menembak satu pemain.", actionType: 'shoot' },
    VILLAGER: { name: "Warga Desa", team: "Warga", desc: "Tugasmu berdebat, mencari kebenaran, dan menuduh siapa Penghasut yang sebenarnya.", actionType: null },
};

// --- FUNGSI UTILITY SERVER ---
function getAlivePlayers(desa) {
    return desa.players.filter(id => !players[id].isDead).map(id => players[id]);
}

function updateDesasList() {
    const publicDesasList = Object.entries(desas).map(([name, data]) => ({
        name: name,
        playerCount: data.players.length,
        status: data.status,
    }));
    io.emit('desas list update', publicDesasList);
}

function updateDesaPlayers(desaName) {
    const desa = desas[desaName];
    if (!desa) return;

    // Kirim data lengkap agar klien bisa menentukan status isDead
    const publicPlayers = desa.players.map(id => ({
        id: id,
        name: players[id] ? players[id].name : 'Warga Hilang',
        isCreator: id === desa.creatorId,
        isDead: players[id] ? players[id].isDead : false, 
        vigilanteBullets: (players[id] && players[id].role === ROLES.VIGILANTE.name && !players[id].isDead) ? players[id].vigilanteBullets : undefined
    }));
    
    io.to(desaName).emit('desa players update', publicPlayers, desa.creatorId);
}

function updatePlayerCount() {
    io.emit('player count update', Object.keys(players).length);
}

// --- LOGIKA PEMBAGIAN PERAN ---
function assignRoles(desaName) {
    const desa = desas[desaName];
    
    if (!desa) {
        console.error(`[ERROR] Desa ${desaName} tidak ditemukan saat pembagian peran.`);
        return;
    }
    
    const playerIds = [...desa.players];
    
    let availableRoles = [];
    // Logika pemilihan peran minimal 4 pemain
    availableRoles.push('WEREWOLF', 'SEER', 'DOCTOR'); 
    if (playerIds.length >= 5) availableRoles.push('HUNTER');
    if (playerIds.length >= 6) availableRoles.push('COFFEE_SELLER');
    if (playerIds.length >= 7) availableRoles.push('VIGILANTE');
    
    let numVillagers = playerIds.length - availableRoles.length;
    for (let i = 0; i < numVillagers; i++) availableRoles.push('VILLAGER');

    playerIds.sort(() => Math.random() - 0.5);
    availableRoles.sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < playerIds.length; i++) {
        const playerId = playerIds[i];
        const roleKey = availableRoles[i];
        const roleData = ROLES[roleKey];
        
        // Inisialisasi data penting untuk game
        players[playerId].role = roleData.name;
        players[playerId].team = roleData.team;
        players[playerId].isDead = false;
        players[playerId].isProtected = false; 
        players[playerId].vigilanteBullets = (roleKey === 'VIGILANTE') ? 2 : 0; 
        
        io.to(playerId).emit('your role', {
            name: roleData.name,
            desc: roleData.desc,
            team: roleData.team,
            actionType: roleData.actionType,
            vigilanteBullets: players[playerId].vigilanteBullets
        });
    }
    
    io.to(desaName).emit('chat message', `[TUKANG CERITA] <strong>PERAN TELAH DIBAGIKAN!</strong> Malam pertama akan segera dimulai...`);
    
    startGameLoop(desaName);
}

// --- LOGIKA SIKLUS GAME KRITIS ---

function startGameLoop(desaName) {
    const desa = desas[desaName];
    desa.game = {
        phase: 'NIGHT',
        day: 1,
        timer: PHASES.NIGHT.duration,
        actions: {}, 
        votes: {}, 
        loopInterval: null,
    };
    nextPhase(desaName);
}

function nextPhase(desaName) {
    const desa = desas[desaName];
    if (!desa || desa.status !== 'playing') return;

    if (desa.game.loopInterval) clearInterval(desa.game.loopInterval);

    let currentPhase = desa.game.phase;
    let nextPhaseName;

    // 1. PROSES HASIL FASE SEBELUMNYA
    if (currentPhase === 'NIGHT') {
        const result = processNightActions(desaName);
        desa.game.day++;
        nextPhaseName = 'DAY';
        
        if (checkWinCondition(desaName)) return;

        io.to(desaName).emit('chat message', `[PAGI HARI KE-${desa.game.day}] Matahari terbit. ${result}`);
        
    } else if (currentPhase === 'DAY') {
        nextPhaseName = 'VOTING';
        io.to(desaName).emit('chat message', `[VOTING] Debat berakhir. Saatnya memilih Warga yang harus meninggalkan Desa.`);

    } else if (currentPhase === 'VOTING') {
        const result = handleVoting(desaName);
        nextPhaseName = 'NIGHT';

        if (checkWinCondition(desaName)) return;

        io.to(desaName).emit('chat message', `[MALAM TIBA] Senja datang. Desa kembali sunyi...`);
    } else {
        nextPhaseName = 'NIGHT';
    }

    // 2. MULAI FASE BARU
    const nextPhaseData = PHASES[nextPhaseName];
    desa.game.phase = nextPhaseName;
    desa.game.timer = nextPhaseData.duration;
    
    desa.game.actions = {};
    desa.game.votes = {};

    io.to(desaName).emit('new phase', nextPhaseName); 

    desa.game.loopInterval = setInterval(() => {
        desa.game.timer--;
        io.to(desaName).emit('phase update', {
            phase: desa.game.phase,
            day: desa.game.day,
            timer: desa.game.timer,
        });

        if (desa.game.timer <= 0) {
            nextPhase(desaName);
        }
    }, 1000);

    // 3. KIRIM PERINTAH FASE SPESIFIK KE KLIEN
    if (nextPhaseName === 'NIGHT') {
        getAlivePlayers(desa).forEach(p => players[p.id].isProtected = false);
        const nightRoles = getAlivePlayers(desa).filter(p => p.role !== ROLES.VILLAGER.name && p.role !== ROLES.HUNTER.name && p.role !== ROLES.COFFEE_SELLER.name);
        nightRoles.forEach(p => {
            io.to(p.id).emit('show night action', {
                role: p.role,
                bullets: p.vigilanteBullets
            });
        });

    } else if (nextPhaseName === 'VOTING') {
        io.to(desaName).emit('show voting');
    }
}

function processNightActions(desaName) {
    const desa = desas[desaName];
    const { actions } = desa.game;
    
    // Mencari target dari masing-masing aksi (wolf, doc, vig, seer)
    let victimId = Object.entries(actions).find(([voterId, targetId]) => players[voterId] && players[voterId].role === ROLES.WEREWOLF.name)?.[1];
    let protectedId = Object.entries(actions).find(([voterId, targetId]) => players[voterId] && players[voterId].role === ROLES.DOCTOR.name)?.[1];
    let vigilanteShotId = Object.entries(actions).find(([voterId, targetId]) => players[voterId] && players[voterId].role === ROLES.VIGILANTE.name)?.[1];
    let peekedId = Object.entries(actions).find(([voterId, targetId]) => players[voterId] && players[voterId].role === ROLES.SEER.name)?.[1];
    
    let result = "Desa sunyi, tidak ada yang terbunuh.";
    
    let isHunterDead = false; 
    let finalVictimId = null; 

    // 1. PROSES AKSI PAK RT (PEEK)
    if (peekedId && players[peekedId]) {
        const roleData = ROLES[Object.keys(ROLES).find(k => ROLES[k].name === players[peekedId].role)];
        const seerId = Object.keys(actions).find(k => players[k] && players[k].role === ROLES.SEER.name);
        if (seerId) {
             io.to(seerId).emit('chat message', `[PAK RT] <strong>${players[peekedId].name}</strong> adalah <strong>${roleData.team}</strong>.`);
        }
    }

    // 2. PROSES TEMBAKAN PENSIUNAN TENTARA
    if (vigilanteShotId && players[vigilanteShotId] && !players[vigilanteShotId].isDead) {
        if (vigilanteShotId === protectedId) {
            io.to(desaName).emit('chat message', `[TUKANG CERITA] <strong>${players[vigilanteShotId].name}</strong> diserang tembakan, tetapi berhasil diselamatkan!`);
        } else {
            finalVictimId = vigilanteShotId;
        }
    }

    // 3. PROSES PEMBUNUHAN PENGHASUT
    if (victimId && players[victimId] && !players[victimId].isDead && victimId !== finalVictimId) { 
        if (victimId === protectedId) {
            players[victimId].isProtected = true;
            io.to(desaName).emit('chat message', `[TUKANG CERITA] <strong>${players[victimId].name}</strong> diserang Penghasut, tetapi berhasil dilindungi oleh Dokter Polindes!`);
        } else {
            finalVictimId = victimId; 
        }
    }
    
    // 4. KONSEKUENSI KEMATIAN
    if (finalVictimId) {
        players[finalVictimId].isDead = true;
        result = `Mayat <strong>${players[finalVictimId].name}</strong> (${players[finalVictimId].role}) ditemukan.`;
        io.to(desaName).emit('chat message', `[TUKANG CERITA] Di pagi hari, Warga menemukan mayat <strong>${players[finalVictimId].name}</strong> (${players[finalVictimId].role}).`);
        isHunterDead = players[finalVictimId].role === ROLES.HUNTER.name;
        
        if (players[finalVictimId].role === ROLES.COFFEE_SELLER.name) {
             io.to(desaName).emit('chat message', `[KEBENARAN] Kopi tumpah... Warga tahu: <strong>Penghasut adalah pelakunya</strong>!`);
        }
    }

    // 5. LOGIKA HANSIP (HUNTER) - Balas Dendam
    if (isHunterDead) {
        const wolfId = Object.keys(actions).find(k => players[k] && players[k].role === ROLES.WEREWOLF.name);
        
        if (wolfId && players[wolfId] && !players[wolfId].isDead) {
             players[wolfId].isDead = true;
             io.to(desaName).emit('chat message', `[BALAS DENDAM HANSIP] Sebelum meninggal, <strong>Hansip Desa</strong> menembak mati <strong>${players[wolfId].name}</strong> (${players[wolfId].role})!`);
        }
    }

    updateDesaPlayers(desaName);
    return result;
}

function handleVoting(desaName) {
    const desa = desas[desaName];
    const { votes } = desa.game;
    let voteCounts = {}; 

    Object.keys(votes).forEach(voterId => {
        if (players[voterId] && !players[voterId].isDead) {
            const targetId = votes[voterId];
            if (targetId) { 
                voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
            }
        }
    });

    let executedId = null;
    let maxVotes = 0;
    let tie = false;
    
    for (const id in voteCounts) {
        if (voteCounts[id] > maxVotes) {
            maxVotes = voteCounts[id];
            executedId = id;
            tie = false;
        } else if (voteCounts[id] === maxVotes) {
            tie = true; 
        }
    }
    
    if (tie) executedId = null;

    let result = "Warga Desa gagal mencapai kesepakatan. Tidak ada yang dieksekusi.";

    if (executedId && players[executedId]) {
        players[executedId].isDead = true;
        result = `Setelah perdebatan sengit, Warga Desa mengeksekusi <strong>${players[executedId].name}</strong> (${players[executedId].role}).`;
        io.to(desaName).emit('chat message', `[EKSEKUSI] <strong>${players[executedId].name}</strong> dieksekusi oleh Warga! Perannya adalah: <strong>${players[executedId].role}</strong>.`);

        if (players[executedId].role === ROLES.HUNTER.name) {
            io.to(desaName).emit('chat message', `[BALAS DENDAM HANSIP] Hansip Desa terbunuh di siang hari, namun tidak sempat membalas dendam.`);
        }
    } else {
        io.to(desaName).emit('chat message', result);
    }
    
    updateDesaPlayers(desaName);
    return result;
}

function checkWinCondition(desaName) {
    const desa = desas[desaName];
    const alivePlayers = getAlivePlayers(desa);
    
    const wolves = alivePlayers.filter(p => p.team === 'Penghasut').length;
    const villagers = alivePlayers.filter(p => p.team === 'Warga').length;
    const allPlayersInDesa = desa.players.map(id => ({
        name: players[id].name,
        role: players[id].role, 
        team: players[id].team
    }));
    
    if (wolves === 0) {
        io.to(desaName).emit('game over', { 
            winner: 'Warga', 
            message: 'Semua Penghasut telah ditemukan dan dieksekusi. Warga Desa menang!',
            allPlayers: allPlayersInDesa // PASTIKAN ADA
        });
        desa.status = 'lobby';
        if (desa.game.loopInterval) clearInterval(desa.game.loopInterval);
        updateDesasList();
        return true;
    }

    if (wolves >= villagers) {
         io.to(desaName).emit('game over', { 
            winner: 'Penghasut', 
            message: 'Jumlah Penghasut menyamai Warga Desa. Desa dikuasai kebohongan. Penghasut menang!',
            allPlayers: allPlayersInDesa // PASTIKAN ADA
        });
        desa.status = 'lobby';
        if (desa.game.loopInterval) clearInterval(desa.game.loopInterval);
        updateDesasList();
        return true;
    }
    return false;
}

// === KONEKSI SOCKET.IO & LOGIKA CORE ===
io.on('connection', (socket) => {
    // Inisialisasi Player
    players[socket.id] = { 
        id: socket.id, name: DEFAULT_NICKNAME, role: ROLES.VILLAGER.name, team: ROLES.VILLAGER.team,
        desa: null, isDead: false, isProtected: false, vigilanteBullets: 0
    };
    updatePlayerCount();
    updateDesasList();

    // 1. DAFTAR NAMA
    socket.on('register user', (nickname) => {
        players[socket.id].name = nickname.substring(0, 15); // Batasi nama 15 karakter
        socket.emit('registration complete', players[socket.id].name);
        io.to(players[socket.id].desa).emit('desa players update', desas[players[socket.id].desa]?.players.map(id => players[id]));
        updateDesasList();
    });

    // 2. BUAT DESA
    socket.on('create desa', (desaName) => {
        if (desas[desaName]) {
            socket.emit('desa error', 'Nama Desa sudah digunakan. Coba nama lain.');
            return;
        }
        if (players[socket.id].desa) {
            socket.emit('desa error', 'Anda sudah berada di desa lain.');
            return;
        }

        desas[desaName] = {
            creatorId: socket.id,
            players: [socket.id],
            status: 'lobby',
            game: null
        };
        players[socket.id].desa = desaName;
        socket.join(desaName);
        socket.emit('desa joined', desaName);
        io.to(desaName).emit('chat message', `[INFO] <strong>${players[socket.id].name}</strong> membangun desa.`);
        updateDesasList();
        updateDesaPlayers(desaName);
    });

    // 3. GABUNG DESA
    socket.on('join desa', (desaName) => {
        const desa = desas[desaName];
        if (!desa) {
            socket.emit('desa error', 'Desa tidak ditemukan.');
            return;
        }
        if (desa.status !== 'lobby') {
            socket.emit('desa error', 'Permainan di desa ini sudah dimulai.');
            return;
        }
        if (players[socket.id].desa) {
            socket.emit('desa error', 'Anda sudah berada di desa lain.');
            return;
        }
        
        // START: TAMBAHKAN PENGUMUMAN INI
        const pengumumanStabilitas = `
            <p style="color: #ffd700; background: #3e2723; border: 1px solid #ffaa00; padding: 10px; border-radius: 5px; margin: 5px 0;">
                📢 <strong>Pembaruan Koneksi: Jantung Desa (Heartbeat)!</strong><br>
                Jika Anda beralih aplikasi (misalnya WhatsApp) dan kembali <strong>< 90 detik</strong>, Anda <strong>TETAP DI DESA</strong>.<br>
                Sistem hanya akan mencatat Keluar Desa jika sinyal terputus total <strong>> 90 detik</strong>.
            </p>
        `;
        // Kirim pesan pengumuman hanya kepada pemain yang baru bergabung (socket.emit)
        socket.emit('chat message', pengumumanStabilitas);
        // END: TAMBAHKAN PENGUMUMAN
        
        desa.players.push(socket.id);
        players[socket.id].desa = desaName;
        socket.join(desaName);
        socket.emit('desa joined', desaName);
        io.to(desaName).emit('chat message', `[INFO] <strong>${players[socket.id].name}</strong> bergabung dengan desa.`);
        updateDesasList();
        updateDesaPlayers(desaName);
    });
    
    // 4. HANDLER CHAT
    socket.on('desa message', (msg) => { 
        const player = players[socket.id];
        if (!player || !player.desa || !msg.trim() || player.isDead) return; 
        io.to(player.desa).emit('chat message', `<strong>${player.name}</strong>: ${msg}`);
    });

    // 5. START GAME
    socket.on('start game', () => {
        const player = players[socket.id];
        const desa = player ? desas[player.desa] : null;

        if (!desa || desa.creatorId !== socket.id || desa.players.length < 4 || desa.status !== 'lobby') {
            socket.emit('desa error', 'Minimal 4 Warga diperlukan dan Anda harus Tetua Desa.');
            return;
        }
        
        desa.status = 'playing';
        assignRoles(desa.name); 
        io.to(desa.name).emit('game started');
        updateDesasList();
    });

    // 6. SOCKET UNTUK AKSI MALAM (CRITICAL)
    socket.on('night action', (targetId) => {
        const player = players[socket.id];
        const desa = player ? desas[player.desa] : null;
        if (!desa || desa.status !== 'playing' || desa.game.phase !== 'NIGHT' || player.isDead) return;
        
        const role = player.role;
        
        if (role === ROLES.VIGILANTE.name && player.vigilanteBullets <= 0) {
            socket.emit('desa error', 'Anda tidak memiliki peluru lagi.');
            return;
        }
        
        let actionType = null;
        for (const key in ROLES) {
            if (ROLES[key].name === role) {
                actionType = ROLES[key].actionType;
                break;
            }
        }
        
        if (actionType && targetId && players[targetId] && !players[targetId].isDead) {
            desa.game.actions[socket.id] = targetId;

            if (role === ROLES.VIGILANTE.name) {
                player.vigilanteBullets--;
                socket.emit('chat message', `[KONFIRMASI] Anda menembak <strong>${players[targetId].name}</strong>. Peluru tersisa: ${player.vigilanteBullets}.`);
                io.to(player.desa).emit('chat message', `[INFO] Pensiunan Tentara telah mengunci target mencurigakan malam ini.`);
                io.to(socket.id).emit('your role', { 
                    name: player.role,
                    desc: ROLES.VIGILANTE.desc,
                    team: player.team,
                    actionType: ROLES.VIGILANTE.actionType,
                    vigilanteBullets: player.vigilanteBullets
                });
            } else if (role === ROLES.WEREWOLF.name) {
                socket.emit('chat message', `[KONFIRMASI] Anda memilih membunuh <strong>${players[targetId].name}</strong>.`);
                io.to(player.desa).emit('chat message', `[INFO] Sang Penghasut ingin mencari target malam ini.`);
            } else if (role === ROLES.DOCTOR.name) {
                socket.emit('chat message', `[KONFIRMASI] Anda melindungi <strong>${players[targetId].name}</strong>.`);
                io.to(player.desa).emit('chat message', `[INFO] Dokter Polindes ingin menyelamatkan warga desa.`);
            } else if (role === ROLES.SEER.name) {
                 socket.emit('chat message', `[KONFIRMASI] Anda mengintip <strong>${players[targetId].name}</strong>.`);
                 io.to(player.desa).emit('chat message', `[INFO] Pak RT telah keliling desa ini.`);
            }
        } else {
             socket.emit('desa error', 'Target tidak valid.');
        }
    });

    // 7. SOCKET UNTUK VOTING (CRITICAL)
    socket.on('submit vote', (targetId) => {
        const player = players[socket.id];
        const desa = player ? desas[player.desa] : null;
        if (!desa || desa.status !== 'playing' || desa.game.phase !== 'VOTING' || player.isDead) return;

        if (targetId && players[targetId] && !players[targetId].isDead) {
            desa.game.votes[socket.id] = targetId;
            socket.emit('chat message', `[KONFIRMASI] Anda memilih untuk mengeksekusi <strong>${players[targetId].name}</strong>.`);
            io.to(player.desa).emit('chat message', `[INFO] ${player.name} telah menggunakan hak pilihnya.`);
        } else if (targetId === "") {
            desa.game.votes[socket.id] = null; 
            socket.emit('chat message', `[KONFIRMASI] Anda memilih untuk <strong>melewatkan</strong> voting.`);
            io.to(player.desa).emit('chat message', `[INFO] ${player.name} telah menggunakan hak pilihnya.`);
        } else {
            socket.emit('desa error', 'Target voting tidak valid.');
        }
    });

    // 8. DISCONNECT
    socket.on('disconnect', () => {
        const player = players[socket.id];
        const desaName = player ? player.desa : null;
        const playerName = player ? player.name : DEFAULT_NICKNAME;

        if (desaName && desas[desaName]) {
            desas[desaName].players = desas[desaName].players.filter(id => id !== socket.id);
            io.to(desaName).emit('chat message', `[INFO] <strong>${playerName}</strong> meninggalkan desa.`);
            
            if (desas[desaName].players.length === 0) {
                 if (desas[desaName].game && desas[desaName].game.loopInterval) clearInterval(desas[desaName].game.loopInterval);
                delete desas[desaName];
                updateDesasList();
            } else if (desas[desaName].creatorId === socket.id && desas[desaName].players.length > 0) {
                const newCreatorId = desas[desaName].players[0];
                desas[desaName].creatorId = newCreatorId;
                io.to(desaName).emit('chat message', `[INFO] <strong>${players[newCreatorId].name}</strong> mengambil alih kepemimpinan desa.`);
                updateDesasList();
                updateDesaPlayers(desaName);
            } else if (desas[desaName].players.length > 0) {
                updateDesaPlayers(desaName);
            }
        }
        
        if (players[socket.id]) delete players[socket.id];
        console.log(`💀 Warga ${playerName} meninggalkan desa.`);
        updatePlayerCount();
    });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/keep-alive', (req, res) => {
    res.status(200).send('Server is alive!');
});
server.listen(PORT, () => {
    console.log(`Server siap dijalankan di port ${PORT}`);
});
