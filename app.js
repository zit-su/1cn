// ============ FIREBASE CONFIG ============
const firebaseConfig = {
    apiKey: "AIzaSyAAPNK7PEPK90SMSQDCSne3wBr1OYoAXxM",
    authDomain: "store-data-for-sms.firebaseapp.com",
    databaseURL: "https://store-data-for-sms-default-rtdb.firebaseio.com",
    projectId: "store-data-for-sms",
    storageBucket: "store-data-for-sms.firebasestorage.app",
    messagingSenderId: "508840668923",
    appId: "1:508840668923:web:a2589b953085e9b874ca5e"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// ============ STATE ============
let currentUser = null;
let currentUserData = null;
let allUsersCache = {};
let friendsCache = {};
let chatsCache = {};
let chatListeners = {};
let currentChatId = null;
let currentChatData = null;
let currentOtherUserUid = null;
let homeSearchFilter = '';
let userSearchFilter = '';
let selectedGroupMembers = new Set();
let groupMemberSearchFilter = '';
let activeScreen = 'loginScreen';
let toastTimeout = null;

// ============ COOKIE HELPERS ============
function setCookie(name, value, days = 30) {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
}

function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

function deleteCookie(name) {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Lax`;
}

// ============ AVATAR HELPERS ============
function getAvatarColor(uid) {
    const colors = [
        '#7C3AED', '#EC4899', '#F59E0B', '#10B981', '#3B82F6',
        '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#14B8A6',
        '#6366F1', '#D946EF', '#84CC16', '#0EA5E9', '#F43F5E'
    ];
    let hash = 0;
    const str = uid || 'default';
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// ============ TOAST ============
function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast';
    if (type) toast.classList.add(type);
    toast.classList.add('show');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2800);
}

// ============ LOADING ============
function showLoading() {
    document.getElementById('loadingOverlay').classList.add('visible');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('visible');
}

// ============ SCREEN NAVIGATION ============
function showScreen(screenId) {
    const screens = ['loginScreen', 'homeScreen', 'newChatScreen', 'createGroupScreen', 'userInfoScreen', 'chatScreen'];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (id === screenId) {
            el.classList.remove('hidden', 'slide-left', 'slide-right', 'fade-out');
            el.classList.add('active');
        } else {
            el.classList.remove('active');
            el.classList.add('hidden');
        }
    });
    activeScreen = screenId;
}

function goBackToHome() {
    closeUserInfo();
    showScreen('homeScreen');
    renderHomeChats();
}

function closeCreateGroupScreen() {
    showScreen('newChatScreen');
    selectedGroupMembers.clear();
    document.getElementById('groupNameInput').value = '';
    document.getElementById('groupMemberSearch').value = '';
    renderSelectedMembers();
    renderGroupMemberResults([]);
}

function closeUserInfo() {
    if (activeScreen === 'userInfoScreen') {
        showScreen('newChatScreen');
    }
}

function openChatInfo() {
    if (currentOtherUserUid && currentChatData?.type === 'direct') {
        showUserInfo(currentOtherUserUid);
    } else if (currentChatData?.type === 'group') {
        showToast('Group chat', 'success');
    }
}

// ============ LOGIN TABS ============
function switchLoginTab(tab) {
    const loginTab = document.getElementById('loginTabBtn');
    const registerTab = document.getElementById('registerTabBtn');
    const loginForm = document.getElementById('loginFormSection');
    const registerForm = document.getElementById('registerFormSection');
    const errorEl = document.getElementById('loginError');

    errorEl.classList.remove('visible');
    errorEl.style.display = 'none';

    if (tab === 'login') {
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    } else {
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    }
}

function showLoginError(message) {
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    errorEl.classList.add('visible');
    setTimeout(() => {
        errorEl.classList.remove('visible');
        setTimeout(() => { errorEl.style.display = 'none'; }, 400);
    }, 3000);
}

// ============ AUTH HANDLERS ============
async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) {
        showLoginError('Please enter both email and password.');
        return;
    }
    showLoading();
    try {
        const result = await auth.signInWithEmailAndPassword(email, password);
        setCookie('chatverse_user_email', email);
        setCookie('chatverse_user_uid', result.user.uid);
        setCookie('chatverse_user_name', result.user.displayName || '');
        showToast('Welcome back!', 'success');
    } catch (error) {
        showLoginError(getAuthErrorMessage(error));
    } finally {
        hideLoading();
    }
}

async function handleRegister() {
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regConfirmPassword').value;

    if (!name || !email || !password || !confirm) {
        showLoginError('Please fill in all fields.');
        return;
    }
    if (password.length < 6) {
        showLoginError('Password must be at least 6 characters.');
        return;
    }
    if (password !== confirm) {
        showLoginError('Passwords do not match.');
        return;
    }
    showLoading();
    try {
        const result = await auth.createUserWithEmailAndPassword(email, password);
        await result.user.updateProfile({ displayName: name });
        await db.ref('users/' + result.user.uid).set({
            name: name,
            email: email,
            bio: 'Hey there! I am using ChatVerse.',
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            avatarColor: getAvatarColor(result.user.uid)
        });
        setCookie('chatverse_user_email', email);
        setCookie('chatverse_user_uid', result.user.uid);
        setCookie('chatverse_user_name', name);
        showToast('Account created! 🎉', 'success');
    } catch (error) {
        showLoginError(getAuthErrorMessage(error));
    } finally {
        hideLoading();
    }
}

async function handleLogout() {
    try {
        await auth.signOut();
        deleteCookie('chatverse_user_email');
        deleteCookie('chatverse_user_uid');
        deleteCookie('chatverse_user_name');
        currentUser = null;
        currentUserData = null;
        friendsCache = {};
        chatsCache = {};
        Object.keys(chatListeners).forEach(k => chatListeners[k]());
        chatListeners = {};
        showScreen('loginScreen');
        document.getElementById('loginPassword').value = '';
        showToast('Signed out', 'success');
    } catch (error) {
        showToast('Error signing out', 'error');
    }
}

function getAuthErrorMessage(error) {
    switch (error.code) {
        case 'auth/user-not-found':
            return 'No account found with this email.';
        case 'auth/wrong-password':
            return 'Incorrect password. Please try again.';
        case 'auth/invalid-email':
            return 'Invalid email address.';
        case 'auth/email-already-in-use':
            return 'This email is already registered.';
        case 'auth/weak-password':
            return 'Password is too weak. Use at least 6 characters.';
        case 'auth/too-many-requests':
            return 'Too many attempts. Please try again later.';
        case 'auth/network-request-failed':
            return 'Network error. Check your connection.';
        default:
            return error.message || 'An error occurred. Please try again.';
    }
}

// ============ AUTH STATE LISTENER ============
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        // Check cookies
        const savedEmail = getCookie('chatverse_user_email');
        const savedUid = getCookie('chatverse_user_uid');
        const savedName = getCookie('chatverse_user_name');

        if (!savedUid) {
            setCookie('chatverse_user_email', user.email || '');
            setCookie('chatverse_user_uid', user.uid);
            setCookie('chatverse_user_name', user.displayName || '');
        }

        try {
            showLoading();
            const userSnap = await db.ref('users/' + user.uid).get();
            if (userSnap.exists()) {
                currentUserData = userSnap.val();
            } else {
                currentUserData = {
                    name: user.displayName || user.email?.split('@')[0] || 'User',
                    email: user.email || '',
                    bio: 'Hey there! I am using ChatVerse.',
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    avatarColor: getAvatarColor(user.uid)
                };
                await db.ref('users/' + user.uid).set(currentUserData);
            }
            // Update home avatar
            document.getElementById('homeAvatarText').textContent = getInitials(currentUserData.name);
            document.getElementById('homeAvatar').style.background = currentUserData.avatarColor || getAvatarColor(user.uid);
            document.getElementById('homeUserSubtitle').textContent = currentUserData.name || user.email;
            await loadFriends();
            await loadChats();
            showScreen('homeScreen');
            renderHomeChats();
        } catch (error) {
            console.error('Error loading user data:', error);
            showToast('Error loading data', 'error');
        } finally {
            hideLoading();
        }
    } else {
        currentUser = null;
        currentUserData = null;
        showScreen('loginScreen');
    }
});

// ============ DATABASE HELPERS ============
async function loadFriends() {
    if (!currentUser) return;
    try {
        const friendsSnap = await db.ref('friends/' + currentUser.uid).get();
        friendsCache = friendsSnap.val() || {};
        const friendUids = Object.keys(friendsCache);
        for (const uid of friendUids) {
            if (!allUsersCache[uid]) {
                const userSnap = await db.ref('users/' + uid).get();
                if (userSnap.exists()) {
                    allUsersCache[uid] = { uid, ...userSnap.val() };
                }
            }
        }
    } catch (error) {
        console.error('Error loading friends:', error);
    }
}

async function loadChats() {
    if (!currentUser) return;
    try {
        const userChatsSnap = await db.ref('chats').orderByChild('participants/' + currentUser.uid).equalTo(true).get();
        chatsCache = {};
        const chatData = userChatsSnap.val();
        if (chatData) {
            for (const [chatId, chat] of Object.entries(chatData)) {
                chatsCache[chatId] = chat;
                if (chat.type === 'direct') {
                    const otherUid = Object.keys(chat.participants).find(uid => uid !== currentUser.uid);
                    if (otherUid && !allUsersCache[otherUid]) {
                        const userSnap = await db.ref('users/' + otherUid).get();
                        if (userSnap.exists()) {
                            allUsersCache[otherUid] = { uid: otherUid, ...userSnap.val() };
                        }
                    }
                }
            }
        }
        listenToChatUpdates();
    } catch (error) {
        console.error('Error loading chats:', error);
    }
}

function listenToChatUpdates() {
    if (!currentUser) return;
    if (chatListeners['chat_list']) chatListeners['chat_list']();
    chatListeners['chat_list'] = db.ref('chats')
        .orderByChild('participants/' + currentUser.uid)
        .equalTo(true)
        .on('value', async (snap) => {
            chatsCache = {};
            const chatData = snap.val();
            if (chatData) {
                for (const [chatId, chat] of Object.entries(chatData)) {
                    chatsCache[chatId] = chat;
                    if (chat.type === 'direct') {
                        const otherUid = Object.keys(chat.participants).find(uid => uid !== currentUser.uid);
                        if (otherUid && !allUsersCache[otherUid]) {
                            try {
                                const userSnap = await db.ref('users/' + otherUid).get();
                                if (userSnap.exists()) {
                                    allUsersCache[otherUid] = { uid: otherUid, ...userSnap.val() };
                                }
                            } catch (e) {}
                        }
                    }
                }
            }
            if (activeScreen === 'homeScreen') {
                renderHomeChats();
            }
        });
}

async function searchUsers(query) {
    userSearchFilter = query.trim().toLowerCase();
    if (!userSearchFilter) {
        document.getElementById('friendsListSection').style.display = 'block';
        document.getElementById('searchResultsSection').style.display = 'none';
        renderFriendsList();
        return;
    }
    document.getElementById('friendsListSection').style.display = 'none';
    document.getElementById('searchResultsSection').style.display = 'block';
    document.getElementById('searchResultsTitle').textContent = `Results for "${query}"`;

    const resultsList = document.getElementById('searchResultsList');
    const emptyState = document.getElementById('searchEmptyState');
    resultsList.innerHTML = '';
    showLoading();

    try {
        const usersSnap = await db.ref('users').get();
        const allUsers = usersSnap.val() || {};
        const results = [];
        for (const [uid, userData] of Object.entries(allUsers)) {
            if (uid === currentUser.uid) continue;
            const name = (userData.name || '').toLowerCase();
            const email = (userData.email || '').toLowerCase();
            if (name.includes(userSearchFilter) || email.includes(userSearchFilter)) {
                results.push({ uid, ...userData });
                allUsersCache[uid] = { uid, ...userData };
            }
        }
        if (results.length === 0) {
            emptyState.style.display = 'flex';
        } else {
            emptyState.style.display = 'none';
            results.forEach(user => {
                resultsList.appendChild(createUserListItem(user));
            });
        }
    } catch (error) {
        console.error('Search error:', error);
        emptyState.style.display = 'flex';
        emptyState.querySelector('h3').textContent = 'Error searching';
    } finally {
        hideLoading();
    }
}

function renderFriendsList() {
    const friendsListEl = document.getElementById('friendsList');
    const emptyState = document.getElementById('friendsEmptyState');
    friendsListEl.innerHTML = '';
    const friendUids = Object.keys(friendsCache);
    if (friendUids.length === 0) {
        emptyState.style.display = 'flex';
        return;
    }
    emptyState.style.display = 'none';
    friendUids.forEach(uid => {
        const userData = allUsersCache[uid] || { name: 'Unknown', email: '', avatarColor: getAvatarColor(uid), uid };
        friendsListEl.appendChild(createUserListItem(userData, true));
    });
}

function createUserListItem(userData, isFriend = false) {
    const div = document.createElement('div');
    div.className = 'user-item';
    div.setAttribute('data-uid', userData.uid);

    const avatarColor = userData.avatarColor || getAvatarColor(userData.uid);
    const initials = getInitials(userData.name || userData.email || '?');

    let actionBtn = '';
    if (isFriend) {
        actionBtn = `<button class="user-action-btn message" onclick="event.stopPropagation();startDirectChat('${userData.uid}')">💬 Chat</button>`;
    } else {
        const isAlreadyFriend = friendsCache[userData.uid];
        if (isAlreadyFriend) {
            actionBtn = `<button class="user-action-btn friend" onclick="event.stopPropagation();startDirectChat('${userData.uid}')">💬 Chat</button>`;
        } else {
            actionBtn = `<button class="user-action-btn add" onclick="event.stopPropagation();addFriend('${userData.uid}')">+ Add</button>`;
        }
    }

    div.innerHTML = `
        <div class="user-avatar" style="background:${avatarColor};">${initials}</div>
        <div class="user-info">
            <div class="user-name">${userData.name || 'User'}</div>
            <div class="user-email">${userData.email || ''}</div>
        </div>
        ${actionBtn}
    `;

    div.addEventListener('click', () => {
        showUserInfo(userData.uid);
    });

    return div;
}

async function addFriend(friendUid) {
    if (!currentUser || !friendUid) return;
    showLoading();
    try {
        await db.ref(`friends/${currentUser.uid}/${friendUid}`).set({
            addedAt: firebase.database.ServerValue.TIMESTAMP
        });
        await db.ref(`friends/${friendUid}/${currentUser.uid}`).set({
            addedAt: firebase.database.ServerValue.TIMESTAMP
        });
        friendsCache[friendUid] = true;
        if (!allUsersCache[friendUid]) {
            const snap = await db.ref('users/' + friendUid).get();
            if (snap.exists()) {
                allUsersCache[friendUid] = { uid: friendUid, ...snap.val() };
            }
        }
        showToast('Friend added! 🎉', 'success');
        if (userSearchFilter) {
            searchUsers(userSearchFilter);
        } else {
            renderFriendsList();
        }
    } catch (error) {
        console.error('Add friend error:', error);
        showToast('Error adding friend', 'error');
    } finally {
        hideLoading();
    }
}

async function removeFriend(friendUid) {
    if (!currentUser || !friendUid) return;
    showLoading();
    try {
        await db.ref(`friends/${currentUser.uid}/${friendUid}`).remove();
        await db.ref(`friends/${friendUid}/${currentUser.uid}`).remove();
        delete friendsCache[friendUid];
        showToast('Friend removed', 'success');
        closeUserInfo();
        renderFriendsList();
    } catch (error) {
        console.error('Remove friend error:', error);
        showToast('Error removing friend', 'error');
    } finally {
        hideLoading();
    }
}

// ============ USER INFO SCREEN ============
function showUserInfo(uid) {
    if (!uid) return;
    const userData = allUsersCache[uid];
    if (!userData) {
        showToast('User not found', 'error');
        return;
    }
    const avatarColor = userData.avatarColor || getAvatarColor(uid);
    const initials = getInitials(userData.name || userData.email || '?');
    document.getElementById('profileAvatar').textContent = initials;
    document.getElementById('profileAvatar').style.background = avatarColor;
    document.getElementById('profileName').textContent = userData.name || 'User';
    document.getElementById('profileEmail').textContent = userData.email || '';
    document.getElementById('profileBio').textContent = userData.bio || 'No bio yet';

    const createdAt = userData.createdAt ? new Date(userData.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Unknown';
    document.getElementById('profileSince').textContent = createdAt;

    const actionsEl = document.getElementById('profileActions');
    actionsEl.innerHTML = '';
    const isFriend = friendsCache[uid];

    if (isFriend) {
        actionsEl.innerHTML += `
            <button class="btn btn-primary" onclick="startDirectChat('${uid}')">💬 Start Chat</button>
            <button class="btn btn-danger" onclick="removeFriend('${uid}')">🗑️ Remove Friend</button>
        `;
    } else {
        actionsEl.innerHTML += `
            <button class="btn btn-primary" onclick="addFriend('${uid}')">➕ Add Friend</button>
        `;
    }

    showScreen('userInfoScreen');
}

function showCurrentUserInfo() {
    if (currentUser && currentUserData) {
        const uid = currentUser.uid;
        const userData = { uid, ...currentUserData };
        allUsersCache[uid] = userData;
        const avatarColor = userData.avatarColor || getAvatarColor(uid);
        const initials = getInitials(userData.name || userData.email || '?');
        document.getElementById('profileAvatar').textContent = initials;
        document.getElementById('profileAvatar').style.background = avatarColor;
        document.getElementById('profileName').textContent = userData.name || 'You';
        document.getElementById('profileEmail').textContent = userData.email || '';
        document.getElementById('profileBio').textContent = userData.bio || 'No bio yet';
        document.getElementById('profileSince').textContent = userData.createdAt ? new Date(userData.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Unknown';
        document.getElementById('profileActions').innerHTML = `
            <button class="btn btn-secondary" onclick="closeUserInfo()">Close</button>
        `;
        showScreen('userInfoScreen');
    }
}

// ============ HOME SCREEN RENDER ============
function renderHomeChats() {
    const chatListEl = document.getElementById('chatList');
    chatListEl.innerHTML = '';

    const chatEntries = Object.entries(chatsCache);
    const filteredChats = chatEntries.filter(([chatId, chat]) => {
        if (!homeSearchFilter) return true;
        const otherName = getChatDisplayName(chat);
        return otherName.toLowerCase().includes(homeSearchFilter);
    });

    if (filteredChats.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
            <div class="empty-icon">💬</div>
            <h3>No Conversations Yet</h3>
            <p>Start chatting with friends by tapping the + button below</p>
            <button class="btn btn-primary" onclick="openNewChatScreen()">Start a Chat</button>
        `;
        chatListEl.appendChild(emptyState);
        return;
    }

    filteredChats
        .sort((a, b) => (b[1].lastMessageTime || 0) - (a[1].lastMessageTime || 0))
        .forEach(([chatId, chat]) => {
            chatListEl.appendChild(createChatListItem(chatId, chat));
        });
}

function getChatDisplayName(chat) {
    if (chat.type === 'group') {
        return chat.groupName || 'Group Chat';
    }
    const otherUid = Object.keys(chat.participants).find(uid => uid !== currentUser?.uid);
    if (otherUid && allUsersCache[otherUid]) {
        return allUsersCache[otherUid].name || 'User';
    }
    return 'Chat';
}

function createChatListItem(chatId, chat) {
    const div = document.createElement('div');
    div.className = 'chat-item';
    div.setAttribute('data-chat-id', chatId);

    let displayName, avatarText, avatarColor, statusDot = '';
    if (chat.type === 'group') {
        displayName = chat.groupName || 'Group Chat';
        avatarText = '👥';
        avatarColor = '#7C3AED';
        statusDot = '';
    } else {
        const otherUid = Object.keys(chat.participants).find(uid => uid !== currentUser?.uid);
        const userData = allUsersCache[otherUid] || { name: 'User', email: '' };
        displayName = userData.name || 'User';
        avatarText = getInitials(displayName);
        avatarColor = userData.avatarColor || getAvatarColor(otherUid || '');
        statusDot = `<span class="status-dot online"></span>`;
    }

    const lastMsg = chat.lastMessage || 'No messages yet';
    const lastTime = chat.lastMessageTime ? formatTime(chat.lastMessageTime) : '';
    const unreadCount = chat.unreadCount?.[currentUser?.uid] || 0;

    div.innerHTML = `
        <div class="chat-avatar" style="background:${avatarColor};">${avatarText}${statusDot}</div>
        <div class="chat-info">
            <div class="chat-name">
                ${displayName}
                ${chat.type === 'group' ? '<span class="group-badge">GROUP</span>' : ''}
            </div>
            <div class="chat-preview">${lastMsg}</div>
        </div>
        <div class="chat-meta">
            <div class="chat-time">${lastTime}</div>
            ${unreadCount > 0 ? `<div class="unread-badge">${unreadCount}</div>` : ''}
        </div>
    `;

    div.addEventListener('click', () => {
        openChat(chatId, chat);
    });

    return div;
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

function filterHomeChats(value) {
    homeSearchFilter = value.trim().toLowerCase();
    renderHomeChats();
}

// ============ NEW CHAT SCREEN ============
function openNewChatScreen() {
    showScreen('newChatScreen');
    document.getElementById('userSearchInput').value = '';
    userSearchFilter = '';
    document.getElementById('friendsListSection').style.display = 'block';
    document.getElementById('searchResultsSection').style.display = 'none';
    renderFriendsList();
}

// ============ CREATE GROUP ============
function openCreateGroupScreen() {
    showScreen('createGroupScreen');
    selectedGroupMembers.clear();
    document.getElementById('groupNameInput').value = '';
    document.getElementById('groupMemberSearch').value = '';
    document.getElementById('groupAvatarPreview').textContent = '👥';
    renderSelectedMembers();
    renderGroupMemberResults([]);
}

function updateGroupAvatarPreview() {
    const name = document.getElementById('groupNameInput').value.trim();
    if (name) {
        document.getElementById('groupAvatarPreview').textContent = getInitials(name);
    } else {
        document.getElementById('groupAvatarPreview').textContent = '👥';
    }
}

async function searchGroupMembers(query) {
    groupMemberSearchFilter = query.trim().toLowerCase();
    if (!groupMemberSearchFilter) {
        renderGroupMemberResults([]);
        return;
    }
    showLoading();
    try {
        const usersSnap = await db.ref('users').get();
        const allUsers = usersSnap.val() || {};
        const results = [];
        for (const [uid, userData] of Object.entries(allUsers)) {
            if (uid === currentUser.uid) continue;
            const name = (userData.name || '').toLowerCase();
            const email = (userData.email || '').toLowerCase();
            if (name.includes(groupMemberSearchFilter) || email.includes(groupMemberSearchFilter)) {
                results.push({ uid, ...userData });
                allUsersCache[uid] = { uid, ...userData };
            }
        }
        renderGroupMemberResults(results);
    } catch (error) {
        console.error('Group member search error:', error);
        renderGroupMemberResults([]);
    } finally {
        hideLoading();
    }
}

function renderGroupMemberResults(results) {
    const container = document.getElementById('groupMemberResults');
    container.innerHTML = '';
    if (results.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:16px;font-size:14px;">Search to add members</p>';
        return;
    }
    results.forEach(user => {
        const isSelected = selectedGroupMembers.has(user.uid);
        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `
            <div class="user-avatar" style="background:${user.avatarColor || getAvatarColor(user.uid)};">${getInitials(user.name || '?')}</div>
            <div class="user-info">
                <div class="user-name">${user.name || 'User'}</div>
                <div class="user-email">${user.email || ''}</div>
            </div>
            <button class="user-action-btn ${isSelected ? 'friend' : 'add'}" onclick="toggleGroupMember('${user.uid}','${(user.name||'User').replace(/'/g,"\\'")}','${user.avatarColor || getAvatarColor(user.uid)}')">
                ${isSelected ? '✓ Added' : '+ Add'}
            </button>
        `;
        container.appendChild(div);
    });
}

function toggleGroupMember(uid, name, avatarColor) {
    if (selectedGroupMembers.has(uid)) {
        selectedGroupMembers.delete(uid);
    } else {
        selectedGroupMembers.add(uid);
    }
    renderSelectedMembers();
    if (groupMemberSearchFilter) {
        searchGroupMembers(groupMemberSearchFilter);
    }
}

function renderSelectedMembers() {
    const container = document.getElementById('selectedMembersChips');
    container.innerHTML = '';
    selectedGroupMembers.forEach(uid => {
        const userData = allUsersCache[uid] || { name: 'User', avatarColor: getAvatarColor(uid) };
        const chip = document.createElement('div');
        chip.className = 'selected-member-chip';
        chip.innerHTML = `
            ${getInitials(userData.name || '?')} ${userData.name || 'User'}
            <button class="remove-chip" onclick="toggleGroupMember('${uid}')">×</button>
        `;
        container.appendChild(chip);
    });
}

async function createGroup() {
    const groupName = document.getElementById('groupNameInput').value.trim();
    if (!groupName) {
        showToast('Please enter a group name', 'error');
        return;
    }
    if (selectedGroupMembers.size === 0) {
        showToast('Please add at least one member', 'error');
        return;
    }
    showLoading();
    try {
        const participants = { [currentUser.uid]: true };
        selectedGroupMembers.forEach(uid => { participants[uid] = true; });

        const chatRef = db.ref('chats').push();
        await chatRef.set({
            type: 'group',
            participants,
            groupName,
            createdBy: currentUser.uid,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            lastMessage: 'Group created',
            lastMessageTime: firebase.database.ServerValue.TIMESTAMP,
            lastSenderUid: currentUser.uid
        });
        showToast('Group created! 🎉', 'success');
        closeCreateGroupScreen();
        goBackToHome();
    } catch (error) {
        console.error('Create group error:', error);
        showToast('Error creating group', 'error');
    } finally {
        hideLoading();
    }
}

// ============ CHAT ============
async function startDirectChat(otherUid) {
    if (!currentUser || !otherUid) return;
    showLoading();
    try {
        const uids = [currentUser.uid, otherUid].sort();
        const chatId = `direct_${uids[0]}_${uids[1]}`;
        let chat = chatsCache[chatId];

        if (!chat) {
            const chatSnap = await db.ref('chats/' + chatId).get();
            if (chatSnap.exists()) {
                chat = chatSnap.val();
                chatsCache[chatId] = chat;
            } else {
                chat = {
                    type: 'direct',
                    participants: { [currentUser.uid]: true, [otherUid]: true },
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    lastMessage: '',
                    lastMessageTime: firebase.database.ServerValue.TIMESTAMP,
                    lastSenderUid: ''
                };
                await db.ref('chats/' + chatId).set(chat);
                chatsCache[chatId] = chat;
            }
        }
        if (!allUsersCache[otherUid]) {
            const userSnap = await db.ref('users/' + otherUid).get();
            if (userSnap.exists()) {
                allUsersCache[otherUid] = { uid: otherUid, ...userSnap.val() };
            }
        }
        currentOtherUserUid = otherUid;
        openChat(chatId, chatsCache[chatId] || chat);
    } catch (error) {
        console.error('Start chat error:', error);
        showToast('Error starting chat', 'error');
    } finally {
        hideLoading();
    }
}

function openChat(chatId, chatData) {
    currentChatId = chatId;
    currentChatData = chatData;
    currentOtherUserUid = chatData.type === 'direct' ?
        Object.keys(chatData.participants).find(uid => uid !== currentUser?.uid) :
        null;

    const displayName = getChatDisplayName(chatData);
    document.getElementById('chatHeaderName').textContent = displayName;
    document.getElementById('chatHeaderStatus').textContent = chatData.type === 'group' ?
        `${Object.keys(chatData.participants).length} members` :
        'online';

    const avatarEl = document.getElementById('chatHeaderAvatar');
    if (chatData.type === 'group') {
        avatarEl.textContent = '👥';
        avatarEl.style.background = '#7C3AED';
    } else {
        const userData = allUsersCache[currentOtherUserUid] || { name: 'User' };
        avatarEl.textContent = getInitials(userData.name);
        avatarEl.style.background = userData.avatarColor || getAvatarColor(currentOtherUserUid);
    }

    document.getElementById('messagesContainer').innerHTML = '';
    document.getElementById('chatInput').value = '';
    document.getElementById('sendBtn').disabled = true;

    if (chatListeners['messages_' + chatId]) {
        chatListeners['messages_' + chatId]();
        delete chatListeners['messages_' + chatId];
    }

    chatListeners['messages_' + chatId] = db.ref('messages/' + chatId)
        .orderByChild('timestamp')
        .on('value', (snap) => {
            const messagesData = snap.val();
            renderMessages(messagesData);
        });

    showScreen('chatScreen');
    setTimeout(scrollChatToBottom, 100);
}

function renderMessages(messagesData) {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';
    if (!messagesData) return;

    const messages = Object.values(messagesData).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    messages.forEach(msg => {
        const isSent = msg.senderUid === currentUser?.uid;
        const row = document.createElement('div');
        row.className = `message-row ${isSent ? 'sent' : 'received'}`;

        let senderName = '';
        if (!isSent && currentChatData?.type === 'group') {
            const senderData = allUsersCache[msg.senderUid];
            senderName = senderData?.name || 'User';
        }

        row.innerHTML = `
            <div class="message-bubble">
                ${senderName ? `<span class="message-sender">${senderName}</span>` : ''}
                ${msg.text || ''}
                <span class="message-time">${formatMessageTime(msg.timestamp)}</span>
            </div>
        `;
        container.appendChild(row);
    });
    scrollChatToBottom();
}

function formatMessageTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function scrollChatToBottom() {
    const container = document.getElementById('messagesContainer');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

function onChatInput(value) {
    document.getElementById('sendBtn').disabled = !value.trim();
}

function onChatKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !currentChatId || !currentUser) return;

    input.value = '';
    document.getElementById('sendBtn').disabled = true;

    try {
        const messageRef = db.ref('messages/' + currentChatId).push();
        await messageRef.set({
            senderUid: currentUser.uid,
            text: text,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        await db.ref('chats/' + currentChatId).update({
            lastMessage: text,
            lastMessageTime: firebase.database.ServerValue.TIMESTAMP,
            lastSenderUid: currentUser.uid
        });
        scrollChatToBottom();
    } catch (error) {
        console.error('Send message error:', error);
        showToast('Failed to send message', 'error');
        input.value = text;
        document.getElementById('sendBtn').disabled = false;
    }
}

function closeChatScreen() {
    if (chatListeners['messages_' + currentChatId]) {
        chatListeners['messages_' + currentChatId]();
        delete chatListeners['messages_' + currentChatId];
    }
    currentChatId = null;
    currentChatData = null;
    currentOtherUserUid = null;
    showScreen('homeScreen');
    renderHomeChats();
}

// ============ INITIALIZATION ============
(function initFromCookies() {
    const savedEmail = getCookie('chatverse_user_email');
    if (savedEmail) {
        document.getElementById('loginEmail').value = savedEmail;
    }
})();

document.getElementById('loginPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
});
document.getElementById('loginEmail').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
});
document.getElementById('regPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleRegister();
});
document.getElementById('regConfirmPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleRegister();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (activeScreen === 'chatScreen') closeChatScreen();
        else if (activeScreen === 'newChatScreen') goBackToHome();
        else if (activeScreen === 'createGroupScreen') closeCreateGroupScreen();
        else if (activeScreen === 'userInfoScreen') closeUserInfo();
    }
});

console.log('💬 ChatVerse initialized successfully!');
console.log('📱 Firebase connected:', firebaseConfig.projectId);
