// Classic global feature implementation.
Object.assign(window.App, {
    async waitForDataReady(timeoutMs = 4000) {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('ডাটা সার্ভারে সংযোগের সময় শেষ হয়েছে।')), timeoutMs);
        });
        try {
            await Promise.race([Promise.resolve(DataManager.ensureReady()), timeout]);
        } finally {
            clearTimeout(timer);
        }
    },

    async checkAuth() {
        const hasCachedSession = Boolean(window.__hasCachedAuthSession);
        if (hasCachedSession) {
            this.setLoading(true, 'جاري التحميل...');
            document.getElementById('login-page').style.display = 'none';
        } else {
            this.setLoading(false);
            this.showLogin();
        }
        document.querySelector('.app-container').style.display = 'none';

        try {
            await this.waitForDataReady();
            if (DataManager.isLoggedIn()) {
                await this.showApp();
            } else {
                this.setLoading(false);
                this.showLogin();
            }
        } catch (err) {
            console.error('Authentication initialization failed:', err);
            this.setLoading(false);
            this.showLogin();
            const msgEl = document.getElementById('supabase-required-msg');
            if (msgEl) {
                msgEl.textContent = 'সার্ভারে সংযোগ করা যাচ্ছে না। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।';
                msgEl.style.display = 'block';
            }
        }
    },

    showLogin() {
        document.documentElement.classList.remove('auth-session-hint');
        document.getElementById('login-page').style.display = '';
        document.getElementById('login-page').classList.add('active');
        document.querySelector('.app-container').style.display = 'none';
        const msgEl = document.getElementById('supabase-required-msg');
        if (msgEl) msgEl.style.display = window.SUPABASE_REQUIRED ? 'block' : 'none';
    },

    async showApp() {
        document.getElementById('login-page').style.display = 'none';
        document.getElementById('login-page').classList.remove('active');
        document.querySelector('.app-container').style.display = 'flex';
        this.setLoading(true, 'جاري تحميل المكتبة...');
        await this.waitForDataReady();
        if (DataManager.refreshProfile) await DataManager.refreshProfile();
        this.state.userRole = DataManager.getCurrentUserRole ? DataManager.getCurrentUserRole() : 'viewer';
        this.updateNavForRole();
        this.navigateTo('dashboard');
        this.setLoading(false);
    },

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        this.setLoginBusy(true);
        this.setLoading(true, 'جاري تسجيل الدخول...');
        try {
            const result = await Promise.resolve(DataManager.login(email, password));
            if (result) {
                await this.showApp();
            } else {
                this.setLoading(false);
                alert('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
            }
        } catch (err) {
            this.setLoading(false);
            this.showLogin();
            alert(err && err.message ? err.message : 'حدث خطأ. تأكد من إعداد Supabase في js/config.js.');
        } finally {
            this.setLoginBusy(false);
        }
    },

    async handleLogout() {
        await Promise.resolve(DataManager.logout());
        this.showLogin();
    },

    async handleChangePassword(e) {
        e.preventDefault();
        const newP = document.getElementById('new-password').value;
        const confirmP = document.getElementById('confirm-password').value;
        if (!newP || newP.length < 6) {
            alert('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.');
            return;
        }
        if (newP !== confirmP) {
            alert('كلمة المرور وتأكيد كلمة المرور غير متطابقتين.');
            return;
        }
        try {
            await Promise.resolve(DataManager.updateOwnPassword(newP));
            document.getElementById('change-password-form').reset();
            alert('تم تغيير كلمة المرور بنجاح.');
        } catch (err) {
            alert('فشل تغيير كلمة المرور: ' + (err?.message || err));
        }
    },

    toggleForgotPasswordForm() {
        const form = document.getElementById('forgot-password-form');
        const wrap = document.querySelector('.login-forgot-wrap');
        if (form.style.display === 'none') {
            form.style.display = 'block';
            if (wrap) wrap.style.display = 'none';
            document.getElementById('forgot-email').value = document.getElementById('login-email').value.trim();
        } else {
            form.style.display = 'none';
            if (wrap) wrap.style.display = 'block';
        }
    },

    async handleSendPasswordReset() {
        const email = document.getElementById('forgot-email').value.trim();
        if (!email) {
            alert('أدخل البريد الإلكتروني.');
            return;
        }
        try {
            await Promise.resolve(DataManager.sendPasswordResetEmail(email));
            alert('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك. راجع صندوق الوارد واتبع الرابط.');
            this.toggleForgotPasswordForm();
        } catch (err) {
            alert('فشل الإرسال: ' + (err?.message || err));
        }
    },

});
