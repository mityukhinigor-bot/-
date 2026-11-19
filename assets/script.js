const baseUrl = 'http://kino.vippo.ru/api';
let currentPost = null;
let pageVersion = 0;

function showMessage(text, type = 'danger') {
    const message = document.querySelector('#message');
    message.textContent = text;
    message.className = 'alert alert-' + type;
    message.hidden = !text;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, symbol => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[symbol]));
}

function imageUrl(value) {
    try {
        const url = new URL(value, baseUrl + '/');
        return ['http:', 'https:'].includes(url.protocol) ? escapeHtml(url.href) : '';
    } catch {
        return '';
    }
}

function updateNavigation() {
    const authorized = Boolean(localStorage.getItem('token'));
    ['registerLink', 'loginLink'].forEach(id => {
        document.querySelector('#' + id).hidden = authorized;
    });
    ['profileLink', 'createPostLink', 'logoutLink'].forEach(id => {
        document.querySelector('#' + id).hidden = !authorized;
    });
}

async function request(path, options = {}, authorized = false) {
    const headers = { ...options.headers };
    if (authorized) {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Для этого действия необходимо войти.');
        headers.Authorization = 'Bearer ' + token;
    }
    const response = await fetch(baseUrl + path, { ...options, headers });
    const text = await response.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            if (response.ok) throw new Error('Сервер вернул некорректный ответ.');
        }
    }
    if (!response.ok) {
        if (response.status === 401 && authorized) {
            localStorage.removeItem('token');
            localStorage.removeItem('login');
            openPage('loginPage');
        }
        const errors = data?.errors ? Object.values(data.errors).flat().join(' ') : '';
        throw new Error(errors || data?.message || data?.error || 'Ошибка запроса: ' + response.status);
    }
    return data;
}

async function submitForm(event, action) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    showMessage('');
    try {
        await action();
    } catch (error) {
        showMessage(error.message);
    } finally {
        button.disabled = false;
    }
}

function openPage(page) {
    if (['profilePage', 'createPostPage'].includes(page) && !localStorage.getItem('token')) {
        page = 'loginPage';
    }
    pageVersion++;
    const pages = ['indexPage', 'registerPage', 'loginPage', 'postPage', 'createPostPage', 'profilePage'];
    pages.forEach(id => {
        document.querySelector('#' + id).style.display = id === page ? '' : 'none';
    });
    const links = ['indexLink', 'registerLink', 'loginLink', 'profileLink', 'createPostLink', 'logoutLink'];
    links.forEach(id => {
        document.querySelector('#' + id).classList.toggle('active', id === page.replace('Page', 'Link'));
    });
    showMessage('');
    updateNavigation();
    if (page === 'indexPage') loadPosts();
    if (page === 'profilePage') {
        document.querySelector('#profileGreeting').textContent = `Добро пожаловать, ${localStorage.getItem('login') || 'пользователь'}!`;
        loadMyPosts();
    }
}

async function loadPosts() {
    const version = pageVersion;
    const row = document.querySelector('#indexPage .row');
    row.textContent = 'Загрузка постов...';
    try {
        const posts = await request('/post');
        if (version !== pageVersion) return;
        row.innerHTML = '';
        posts.forEach(post => {
            const element = document.createElement('div');
            element.className = 'col-12 col-sm-6 col-md-4 col-lg-3 mb-4';
            element.innerHTML = `
                <div class="card h-100">
                    ${post.image ? `<img src="${imageUrl(post.image)}" class="card-img-top" alt="${escapeHtml(post.name)}">` : ''}
                    <div class="card-body">
                        <div class="badge bg-success mb-3">${escapeHtml(post.user)}</div>
                        <h5 class="card-title">${escapeHtml(post.name)}</h5>
                        <p class="card-text" style="white-space: pre-wrap">${escapeHtml(post.text)}</p>
                        <button type="button" class="btn btn-primary">Читать пост</button>
                    </div>
                </div>`;
            element.querySelector('button').addEventListener('click', () => loadPost(post.id));
            row.appendChild(element);
        });
        if (!posts.length) row.textContent = 'Постов пока нет.';
    } catch (error) {
        if (version !== pageVersion) return;
        row.textContent = 'Не удалось загрузить посты.';
        showMessage(error.message);
    }
}

async function loadPost(postID) {
    openPage('postPage');
    currentPost = postID;
    const version = pageVersion;
    const page = document.querySelector('#postPage');
    page.textContent = 'Загрузка поста...';
    try {
        const post = await request('/post/' + encodeURIComponent(postID));
        if (version !== pageVersion) return;
        page.innerHTML = `
            <h2 class="mb-4">${escapeHtml(post.name)}</h2>
            ${post.image ? `<img src="${imageUrl(post.image)}" class="img-fluid mb-3" alt="${escapeHtml(post.name)}" width="600">` : ''}
            <p style="white-space: pre-wrap">${escapeHtml(post.text)}</p>
            <h4 class="mt-3">Комментарии</h4>
            ${localStorage.getItem('token') ? `
                <form id="commentForm" class="mb-4">
                    <textarea id="commentText" rows="3" class="form-control" placeholder="Введите комментарий" aria-label="Комментарий" required></textarea>
                    <button type="submit" class="btn btn-success mt-2">Отправить</button>
                </form>` : '<p>Войдите, чтобы оставить комментарий.</p>'}
            <div class="comments"></div>`;
        const comments = page.querySelector('.comments');
        (post.comments || []).forEach(comment => {
            const element = document.createElement('div');
            element.className = 'card mb-3';
            element.innerHTML = `
                <div class="card-body">
                    <div class="d-flex justify-content-between flex-wrap">
                        <h5 class="card-title">${escapeHtml(comment.user)}</h5>
                        <small class="card-text text-muted">${escapeHtml(comment.created_at)}</small>
                    </div>
                    <p class="card-text" style="white-space: pre-wrap">${escapeHtml(comment.text)}</p>
                </div>`;
            comments.appendChild(element);
        });
        if (!post.comments?.length) comments.textContent = 'Комментариев пока нет.';
        if (page.querySelector('#commentForm')) {
            page.querySelector('#commentForm').addEventListener('submit', createComment);
        }
    } catch (error) {
        if (version !== pageVersion) return;
        page.textContent = 'Не удалось загрузить пост.';
        showMessage(error.message);
    }
}

async function register(event) {
    await submitForm(event, async () => {
        const name = document.querySelector('#registerName').value.trim();
        const login = document.querySelector('#registerLogin').value.trim();
        const password = document.querySelector('#registerPassword').value;
        if (!name || !login || !password.trim()) throw new Error('Заполните все поля.');
        await request('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, login, password })
        });
        document.querySelector('#registerForm').reset();
        document.querySelector('#loginLogin').value = login;
        openPage('loginPage');
        showMessage('Регистрация завершена. Войдите в аккаунт.', 'success');
    });
}

async function login(event) {
    await submitForm(event, async () => {
        const login = document.querySelector('#loginLogin').value.trim();
        const password = document.querySelector('#loginPassword').value;
        if (!login || !password.trim()) throw new Error('Введите логин и пароль.');
        const data = await request('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, password })
        });
        if (!data?.token || typeof data.token !== 'string') throw new Error('Сервер не вернул токен входа.');
        localStorage.setItem('token', data.token);
        localStorage.setItem('login', login);
        document.querySelector('#loginForm').reset();
        openPage('profilePage');
    });
}

async function createPost(event) {
    await submitForm(event, async () => {
        const name = document.querySelector('#postName').value.trim();
        const text = document.querySelector('#postText').value.trim();
        const image = document.querySelector('#postImage').files[0];
        if (!name || !text || !image) throw new Error('Заполните все поля и выберите изображение.');
        if (!/\.(png|jpe?g)$/i.test(image.name) || (image.type && !['image/png', 'image/jpeg'].includes(image.type))) {
            throw new Error('Выберите изображение PNG, JPG или JPEG.');
        }
        const body = new FormData();
        body.append('name', name);
        body.append('text', text);
        body.append('image', image);
        await request('/post', { method: 'POST', body }, true);
        document.querySelector('#createPostForm').reset();
        openPage('profilePage');
        showMessage('Пост создан.', 'success');
    });
}

async function loadMyPosts() {
    const version = pageVersion;
    const table = document.querySelector('#myPosts');
    table.innerHTML = '<tr><td colspan="4">Загрузка постов...</td></tr>';
    try {
        const posts = await request('/my-post', {
            headers: { 'Content-Type': 'application/json' }
        }, true);
        if (version !== pageVersion) return;
        table.innerHTML = '';
        posts.forEach(post => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${escapeHtml(post.id)}</td>
                <td>${escapeHtml(post.name)}</td>
                <td>${escapeHtml(post.created_at)}</td>
                <td>
                    <button type="button" class="btn btn-primary mb-1">Перейти к посту</button>
                    <button type="button" class="btn btn-danger mb-1">Удалить пост</button>
                </td>`;
            row.querySelector('.btn-primary').addEventListener('click', () => loadPost(post.id));
            row.querySelector('.btn-danger').addEventListener('click', event => deletePost(post.id, event.currentTarget));
            table.appendChild(row);
        });
        if (!posts.length) table.innerHTML = '<tr><td colspan="4">У вас пока нет постов.</td></tr>';
    } catch (error) {
        if (version !== pageVersion) return;
        table.innerHTML = '<tr><td colspan="4">Не удалось загрузить посты.</td></tr>';
        showMessage(error.message);
    }
}

async function createComment(event) {
    await submitForm(event, async () => {
        const text = document.querySelector('#commentText').value.trim();
        if (!text) throw new Error('Введите текст комментария.');
        const postID = currentPost;
        const version = pageVersion;
        await request('/post/' + encodeURIComponent(postID) + '/comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        }, true);
        if (version === pageVersion) await loadPost(postID);
    });
}

async function deletePost(postID, button) {
    if (!confirm('Удалить пост?')) return;
    button.disabled = true;
    const version = pageVersion;
    try {
        await request('/post/' + encodeURIComponent(postID), { method: 'DELETE' }, true);
        if (version !== pageVersion) return;
        await loadMyPosts();
        showMessage('Пост удалён.', 'success');
    } catch (error) {
        showMessage(error.message);
    } finally {
        button.disabled = false;
    }
}

function logout(event) {
    event.preventDefault();
    localStorage.removeItem('token');
    localStorage.removeItem('login');
    currentPost = null;
    document.querySelector('#postPage').innerHTML = '';
    document.querySelector('#myPosts').innerHTML = '';
    document.querySelector('#createPostForm').reset();
    openPage('indexPage');
}

document.querySelector('#registerForm').addEventListener('submit', register);
document.querySelector('#loginForm').addEventListener('submit', login);
document.querySelector('#createPostForm').addEventListener('submit', createPost);
['indexLink', 'registerLink', 'loginLink', 'profileLink', 'createPostLink', 'logoutLink'].forEach(id => {
    document.querySelector('#' + id).addEventListener('click', event => event.preventDefault());
});
document.querySelector('.navbar-brand').addEventListener('click', event => event.preventDefault());
document.querySelector('.navbar-brand').addEventListener('click', () => openPage('indexPage'));

openPage('indexPage');
