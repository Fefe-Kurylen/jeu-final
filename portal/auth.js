// Système d'authentification API JWT pour Imperium Antiquitas
class AuthSystem {
    constructor() {
        this.currentUser = null;
        this.token = null;
        this.apiBase = window.location.origin; // Utilise le même domaine
        this.loadUser();
    }

    // Charge l'utilisateur depuis le token stocké
    loadUser() {
        this.token = localStorage.getItem('monjeu_token');
        const userData = localStorage.getItem('monjeu_player');

        if (this.token && userData) {
            this.currentUser = JSON.parse(userData);
            this.updateUI();
            // Vérifie que le token est encore valide
            this.verifyToken();
        }
    }

    // Vérifie la validité du token
    async verifyToken() {
        try {
            const response = await fetch(`${this.apiBase}/api/player/me`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (!response.ok) {
                this.logout(false); // Token invalide, déconnexion silencieuse
            }
        } catch (error) {
            console.error('Erreur de vérification du token:', error);
        }
    }

    // Inscription via API
    async register(username, email, password, faction = 'ROME') {
        try {
            const response = await fetch(`${this.apiBase}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: username,
                    email: email,
                    password: password,
                    faction: faction
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erreur d\'inscription');
            }

            // Stocke le token et les infos joueur
            this.token = data.token;
            this.currentUser = {
                id: data.player.id,
                username: data.player.name,
                email: email,
                faction: data.player.faction,
                premium: false,
                createdAt: new Date().toISOString()
            };

            localStorage.setItem('monjeu_token', this.token);
            localStorage.setItem('monjeu_player', JSON.stringify(this.currentUser));

            this.updateUI();
            return this.currentUser;

        } catch (error) {
            console.error('Erreur inscription:', error);
            throw error;
        }
    }

    // Connexion via API
    async login(email, password) {
        try {
            const response = await fetch(`${this.apiBase}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Identifiants invalides');
            }

            // Stocke le token et les infos joueur
            this.token = data.token;
            this.currentUser = {
                id: data.player.id,
                username: data.player.name,
                email: email,
                faction: data.player.faction,
                premium: false,
                createdAt: new Date().toISOString()
            };

            localStorage.setItem('monjeu_token', this.token);
            localStorage.setItem('monjeu_player', JSON.stringify(this.currentUser));

            this.updateUI();
            return this.currentUser;

        } catch (error) {
            console.error('Erreur connexion:', error);
            throw error;
        }
    }

    // Déconnexion
    logout(redirect = true) {
        this.currentUser = null;
        this.token = null;
        localStorage.removeItem('monjeu_token');
        localStorage.removeItem('monjeu_player');
        this.updateUI();

        if (redirect) {
            window.location.href = '/portal/';
        }
    }

    // Vérifie si connecté
    isLoggedIn() {
        return this.token !== null && this.currentUser !== null;
    }

    // Récupère le token pour les requêtes API
    getToken() {
        return this.token;
    }

    // Récupère les stats du joueur depuis l'API
    async getPlayerStats() {
        if (!this.token) return null;

        try {
            const response = await fetch(`${this.apiBase}/api/player/me`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (!response.ok) return null;

            return await response.json();
        } catch (error) {
            console.error('Erreur récupération stats:', error);
            return null;
        }
    }

    // Active le premium (à connecter avec Stripe plus tard)
    async activatePremium() {
        if (this.currentUser) {
            this.currentUser.premium = true;
            localStorage.setItem('monjeu_player', JSON.stringify(this.currentUser));
            alert('🎉 Félicitations ! Vous êtes maintenant Empereur Or !');
            return true;
        }
        return false;
    }

    // Met à jour l'interface
    updateUI() {
        const user = this.currentUser;
        const loginLink = document.getElementById('loginLink');
        const registerLink = document.getElementById('registerLink');
        const dashboardLink = document.getElementById('dashboardLink');

        if (user) {
            if (loginLink) loginLink.style.display = 'none';
            if (registerLink) registerLink.style.display = 'none';
            if (dashboardLink) {
                dashboardLink.style.display = 'block';
                dashboardLink.textContent = user.username;
            }
        } else {
            if (loginLink) loginLink.style.display = 'block';
            if (registerLink) registerLink.style.display = 'block';
            if (dashboardLink) dashboardLink.style.display = 'none';
        }
    }
}

// Initialisation globale
window.auth = new AuthSystem();

// Helper pour les formulaires
document.addEventListener('DOMContentLoaded', function() {
    // Gère le formulaire de login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = this.querySelector('input[type="email"]').value;
            const password = this.querySelector('input[type="password"]').value;

            try {
                await window.auth.login(email, password);
                window.location.href = '/portal/premium/dashboard.html';
            } catch (error) {
                alert(error.message);
            }
        });
    }

    // Gère le formulaire d'inscription
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const inputs = this.querySelectorAll('input');
            const username = inputs[0].value;
            const email = inputs[1].value;
            const password = inputs[2].value;
            const confirmPassword = inputs[3].value;

            if (password !== confirmPassword) {
                alert('Les mots de passe ne correspondent pas');
                return;
            }

            try {
                await window.auth.register(username, email, password);
                alert(`Bienvenue ${username} ! Votre empire a été créé.`);
                window.location.href = '/portal/premium/dashboard.html';
            } catch (error) {
                alert(error.message);
            }
        });
    }

    // Redirection si déjà connecté (pour login/register pages)
    if (window.auth.isLoggedIn()) {
        const path = window.location.pathname;
        if (path.includes('login.html') || path.includes('register.html')) {
            window.location.href = '/portal/premium/dashboard.html';
        }
    }
});
