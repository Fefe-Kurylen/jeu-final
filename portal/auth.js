// Système d'authentification simple
class AuthSystem {
    constructor() {
        this.currentUser = null;
        this.loadUser();
    }

    // Charge l'utilisateur
    loadUser() {
        const userData = localStorage.getItem('imperium_user');
        if (userData) {
            this.currentUser = JSON.parse(userData);
            this.updateUI();
        }
    }

    // Inscription
    register(username, email, password) {
        const user = {
            id: Date.now(),
            username: username,
            email: email,
            createdAt: new Date().toISOString(),
            premium: false
        };

        localStorage.setItem('imperium_user', JSON.stringify(user));
        this.currentUser = user;
        this.updateUI();

        alert(`Bienvenue ${username} !`);
        return user;
    }

    // Connexion (simplifiée)
    login(email, password) {
        // Pour l'instant, ça vérifie juste si un utilisateur existe
        const userData = localStorage.getItem('imperium_user');
        if (!userData) {
            throw new Error('Aucun compte trouvé');
        }

        const user = JSON.parse(userData);
        if (user.email === email) {
            this.currentUser = user;
            this.updateUI();
            return user;
        }

        throw new Error('Email incorrect');
    }

    // Déconnexion
    logout() {
        this.currentUser = null;
        localStorage.removeItem('imperium_user');
        this.updateUI();
        window.location.href = '/portal/';
    }

    // Active le premium
    activatePremium() {
        if (this.currentUser) {
            this.currentUser.premium = true;
            localStorage.setItem('imperium_user', JSON.stringify(this.currentUser));
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
        }
    }
}

// Initialisation globale
window.auth = new AuthSystem();
