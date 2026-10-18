/* ==========================================================================
   MétéoFlash : un seul fichier JavaScript pour tout le site.
   Chaque fonction "page..." ne s'exécute que si la page contient les éléments
   qu'elle attend. Données : Open-Meteo (gratuit, sans clé API).
   ========================================================================== */
'use strict';

/* ---------- 1. OUTILS GÉNÉRAUX ---------- */
const $ = (id) => document.getElementById(id);

const CLES = {
    reglages: 'reglages',       // préférences de la page Paramètres
    theme: 'themeClair',        // true = mode clair
    ville: 'villeActuelle',     // ville choisie par l'utilisateur (recherche / favori)
    lieu: 'dernierLieu',        // dernier lieu affiché (utilisé par les pages de détail)
    favoris: 'favoris',         // liste des villes favorites
    alerte: 'derniereAlerte'    // évite d'envoyer deux fois la même notification
};

const REGLAGES_DEFAUT = {
    unitTemp: 'C',              // 'C' ou 'F'
    unitVent: 'kmh',            // 'kmh', 'ms' ou 'mph'
    heure24: true,              // true = 21:00, false = 9:00 PM
    notifications: true,
    geo: true,
    villeDefaut: 'Oujda'
};

const LIBELLE_VENT = { kmh: 'km/h', ms: 'm/s', mph: 'mph' };

function lire(cle, defaut) {
    try {
        const valeur = localStorage.getItem(cle);
        return valeur === null ? defaut : JSON.parse(valeur);
    } catch (e) {
        return defaut;
    }
}

function ecrire(cle, valeur) {
    try {
        localStorage.setItem(cle, JSON.stringify(valeur));
    } catch (e) { /* stockage indisponible : on ignore */ }
}

function reglages() {
    return Object.assign({}, REGLAGES_DEFAUT, lire(CLES.reglages, {}));
}

function echapper(texte) {
    return String(texte).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

function majuscule(texte) {
    return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/* Petit message temporaire en bas de l'écran */
function toast(message) {
    let el = document.querySelector('.toast');
    if (!el) {
        el = document.createElement('div');
        el.className = 'toast';
        el.setAttribute('role', 'status');
        document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(toast.minuteur);
    toast.minuteur = setTimeout(() => el.classList.remove('visible'), 3000);
}

/* ---------- 2. DATES, HEURES ET UNITÉS ---------- */
/* Open-Meteo renvoie "2026-10-18T21:00" (heure locale de la ville).
   On le découpe à la main pour éviter les décalages de fuseau horaire. */
function dateDepuisISO(iso) {
    const [jour, heure = '0:0'] = iso.split('T');
    const [a, m, j] = jour.split('-').map(Number);
    const [h, min] = heure.split(':').map(Number);
    return new Date(a, m - 1, j, h || 0, min || 0);
}

function formaterHeure(iso) {
    const d = dateDepuisISO(iso);
    let h = d.getHours();
    const min = String(d.getMinutes()).padStart(2, '0');
    if (reglages().heure24) return `${String(h).padStart(2, '0')}:${min}`;
    const suffixe = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${min} ${suffixe}`;
}

function dateLongue(iso) {
    return majuscule(dateDepuisISO(iso).toLocaleDateString('fr-FR',
        { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
}

function jourCourt(iso) {          // "Mer. 15 oct."
    return majuscule(dateDepuisISO(iso).toLocaleDateString('fr-FR',
        { weekday: 'short', day: 'numeric', month: 'short' }));
}

function jourSemaine(iso) {        // "Mer."
    return majuscule(dateDepuisISO(iso).toLocaleDateString('fr-FR', { weekday: 'short' }));
}

function degres(valeur) {
    return `${Math.round(valeur)}°`;
}

/* Codes météo WMO -> [emoji jour, emoji nuit, description] */
const CODES_METEO = {
    0: ['☀️', '🌙', 'Ciel dégagé'],
    1: ['🌤️', '🌙', 'Plutôt dégagé'],
    2: ['⛅', '☁️', 'Partiellement nuageux'],
    3: ['☁️', '☁️', 'Couvert'],
    45: ['🌫️', '🌫️', 'Brouillard'],
    48: ['🌫️', '🌫️', 'Brouillard givrant'],
    51: ['🌦️', '🌧️', 'Bruine légère'],
    53: ['🌦️', '🌧️', 'Bruine'],
    55: ['🌧️', '🌧️', 'Bruine dense'],
    56: ['🌧️', '🌧️', 'Bruine verglaçante'],
    57: ['🌧️', '🌧️', 'Bruine verglaçante'],
    61: ['🌦️', '🌧️', 'Pluie légère'],
    63: ['🌧️', '🌧️', 'Pluie'],
    65: ['🌧️', '🌧️', 'Forte pluie'],
    66: ['🌧️', '🌧️', 'Pluie verglaçante'],
    67: ['🌧️', '🌧️', 'Pluie verglaçante'],
    71: ['🌨️', '🌨️', 'Neige légère'],
    73: ['❄️', '❄️', 'Neige'],
    75: ['❄️', '❄️', 'Forte neige'],
    77: ['❄️', '❄️', 'Grains de neige'],
    80: ['🌦️', '🌧️', 'Averses légères'],
    81: ['🌧️', '🌧️', 'Averses'],
    82: ['🌧️', '🌧️', 'Fortes averses'],
    85: ['🌨️', '🌨️', 'Averses de neige'],
    86: ['🌨️', '🌨️', 'Fortes averses de neige'],
    95: ['⛈️', '⛈️', 'Orage'],
    96: ['⛈️', '⛈️', 'Orage et grêle'],
    99: ['⛈️', '⛈️', 'Orage violent']
};

function infoMeteo(code, jour = true) {
    const info = CODES_METEO[code] || ['❓', '❓', 'Inconnu'];
    return { emoji: jour ? info[0] : info[1], texte: info[2] };
}

/* Icônes SVG (Lucide) utilisées dans les listes générées */
const SVG_DEBUT = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const ICONE_GOUTTE = SVG_DEBUT + '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>';
const ICONE_VENT = SVG_DEBUT + '<path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/></svg>';
const ICONE_ETOILE = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-star" aria-hidden="true"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/></svg>';

/* ---------- 3. APPELS API (Open-Meteo) ---------- */
async function chercherVilles(nom, nombre = 5) {
    const url = 'https://geocoding-api.open-meteo.com/v1/search?' + new URLSearchParams({
        name: nom, count: nombre, language: 'fr', format: 'json'
    });
    const reponse = await fetch(url);
    if (!reponse.ok) throw new Error('Géocodage indisponible');
    const donnees = await reponse.json();
    return donnees.results || [];
}

function lieuDepuisResultat(res) {
    return { nom: res.name, pays: res.country || '', latitude: res.latitude, longitude: res.longitude };
}

function parametresUnites() {
    const r = reglages();
    return {
        wind_speed_unit: r.unitVent,
        temperature_unit: r.unitTemp === 'F' ? 'fahrenheit' : 'celsius'
    };
}

async function chargerMeteo(lieu) {
    const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams(Object.assign({
        latitude: lieu.latitude,
        longitude: lieu.longitude,
        current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,is_day',
        hourly: 'temperature_2m,weather_code,precipitation_probability,wind_speed_10m,is_day',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset',
        timezone: 'auto',
        forecast_days: 7
    }, parametresUnites()));
    const reponse = await fetch(url);
    if (!reponse.ok) throw new Error('Météo indisponible');
    return reponse.json();
}

/* Position dans les tableaux "hourly" de l'heure actuelle */
function indexHeure(data) {
    const cle = data.current.time.slice(0, 13) + ':00';
    const i = data.hourly.time.indexOf(cle);
    return i >= 0 ? i : 0;
}

/* Géolocalisation : renvoie un lieu, ou null si refusée / indisponible */
function positionGeo() {
    return new Promise((resolve) => {
        if (!('geolocation' in navigator)) return resolve(null);
        navigator.geolocation.getCurrentPosition(
            (p) => resolve({ nom: 'Ma position', pays: '', latitude: p.coords.latitude, longitude: p.coords.longitude }),
            () => resolve(null),
            { timeout: 8000 }
        );
    });
}

async function lieuParDefaut() {
    const villes = await chercherVilles(reglages().villeDefaut, 1);
    return villes.length ? lieuDepuisResultat(villes[0]) : null;
}

/* Lieu utilisé par les pages de détail et la carte */
async function lieuCourant() {
    let lieu = lire(CLES.lieu, null);
    if (!lieu) {
        lieu = await lieuParDefaut();
        if (lieu) ecrire(CLES.lieu, lieu);
    }
    return lieu;
}

/* ---------- 4. THÈME CLAIR / SOMBRE ---------- */
function appliquerTheme(clair, sauver = true) {
    document.body.classList.toggle('light-mode', clair);
    if (sauver) ecrire(CLES.theme, clair);
    const sombre = $('theme-sombre');
    const claire = $('theme-clair');
    if (sombre && claire) {
        sombre.classList.toggle('active', !clair);
        claire.classList.toggle('active', clair);
        sombre.setAttribute('aria-pressed', String(!clair));
        claire.setAttribute('aria-pressed', String(clair));
    }
}

function initialiserTheme() {
    appliquerTheme(lire(CLES.theme, false) === true, false);

    const icone = document.querySelector('header .lucide-sun-moon');
    if (icone) {
        icone.style.cursor = 'pointer';
        icone.addEventListener('click', () =>
            appliquerTheme(!document.body.classList.contains('light-mode')));
    }

    const sombre = $('theme-sombre');
    const claire = $('theme-clair');
    if (sombre) sombre.addEventListener('click', () => appliquerTheme(false));
    if (claire) claire.addEventListener('click', () => appliquerTheme(true));
}

/* ---------- 5. BARRE DE RECHERCHE + SUGGESTIONS ---------- */
let accueilActif = null;   // renseigné par pageAccueil() : permet de rafraîchir sans recharger

function choisirVille(resultat) {
    const lieu = lieuDepuisResultat(resultat);
    ecrire(CLES.ville, lieu);
    if (accueilActif) {
        accueilActif(lieu);
    } else {
        location.href = 'acceuil.html';
    }
}

function initialiserRecherche() {
    const input = $('ville');
    if (!input) return;

    const conteneur = input.closest('.recherche');
    const liste = document.createElement('ul');
    liste.className = 'suggestions';
    liste.setAttribute('role', 'listbox');
    conteneur.appendChild(liste);

    let minuteur;
    let numeroRequete = 0;
    let resultats = [];

    const fermer = () => { liste.innerHTML = ''; resultats = []; };

    function afficherSuggestions(villes) {
        resultats = villes;
        liste.innerHTML = '';
        villes.forEach((ville) => {
            const li = document.createElement('li');
            li.setAttribute('role', 'option');
            const detail = [ville.admin1, ville.country].filter(Boolean).join(', ');
            li.innerHTML = `${echapper(ville.name)}<small>${echapper(detail)}</small>`;
            li.addEventListener('mousedown', (e) => e.preventDefault());   // garde le focus
            li.addEventListener('click', () => { input.value = ''; fermer(); choisirVille(ville); });
            liste.appendChild(li);
        });
    }

    // Debounce : on attend 300 ms après la dernière lettre avant d'appeler l'API
    input.addEventListener('input', () => {
        clearTimeout(minuteur);
        const texte = input.value.trim();
        if (texte.length < 2) return fermer();
        minuteur = setTimeout(async () => {
            const numero = ++numeroRequete;
            try {
                const villes = await chercherVilles(texte, 5);
                if (numero === numeroRequete) afficherSuggestions(villes);
            } catch (e) {
                fermer();
            }
        }, 300);
    });

    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Escape') return fermer();
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const texte = input.value.trim();
        if (!texte) return;
        try {
            const villes = resultats.length ? resultats : await chercherVilles(texte, 1);
            if (!villes.length) return toast('Ville introuvable');
            input.value = '';
            fermer();
            choisirVille(villes[0]);
        } catch (err) {
            toast('Recherche impossible. Vérifiez votre connexion.');
        }
    });

    document.addEventListener('click', (e) => { if (!conteneur.contains(e.target)) fermer(); });
}

/* ---------- 6. FAVORIS (stockage) ---------- */
const cleLieu = (l) => `${Number(l.latitude).toFixed(2)},${Number(l.longitude).toFixed(2)}`;
const listeFavoris = () => lire(CLES.favoris, []);
const estFavori = (l) => listeFavoris().some((f) => cleLieu(f) === cleLieu(l));

function basculerFavori(lieu) {
    let liste = listeFavoris();
    if (estFavori(lieu)) {
        liste = liste.filter((f) => cleLieu(f) !== cleLieu(lieu));
        toast(`${lieu.nom} retirée des favoris`);
    } else {
        liste.push(lieu);
        toast(`${lieu.nom} ajoutée aux favoris`);
    }
    ecrire(CLES.favoris, liste);
}

/* ---------- 7. PAGE ACCUEIL ---------- */
let rafraichissement = null;

function majBoutonFavori(lieu) {
    const zone = document.querySelector('.actuelle .lieu');
    if (!zone) return;
    let bouton = zone.querySelector('.btn-favori');
    if (!bouton) {
        bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'btn-favori';
        bouton.innerHTML = ICONE_ETOILE;
        zone.appendChild(bouton);
        bouton.addEventListener('click', () => {
            const courant = lire(CLES.lieu, null);
            if (courant) { basculerFavori(courant); majBoutonFavori(courant); }
        });
    }
    bouton.hidden = lieu.nom === 'Ma position';   // une position GPS ne se met pas en favori
    const favori = estFavori(lieu);
    bouton.classList.toggle('inactif', !favori);
    bouton.setAttribute('aria-label', favori ? 'Retirer des favoris' : 'Ajouter aux favoris');
    bouton.title = bouton.getAttribute('aria-label');
}

function rendreHoraireAccueil(data) {
    const conteneur = $('liste-horaire');
    conteneur.innerHTML = '';
    const debut = indexHeure(data);
    for (let i = debut; i < debut + 7 && i < data.hourly.time.length; i++) {
        const info = infoMeteo(data.hourly.weather_code[i], data.hourly.is_day[i] === 1);
        const bloc = document.createElement('div');
        bloc.className = 'heure';
        bloc.innerHTML = `<span>${formaterHeure(data.hourly.time[i])}</span>
            <span class="emoji">${info.emoji}</span>
            <strong>${degres(data.hourly.temperature_2m[i])}</strong>`;
        conteneur.appendChild(bloc);
    }
}

function rendreJours(data) {
    const conteneur = $('liste-jours');
    const detail = conteneur.classList.contains('detail-liste');   // page "7 jours" ou accueil ?
    conteneur.innerHTML = '';
    data.daily.time.forEach((jour, i) => {
        const info = infoMeteo(data.daily.weather_code[i], true);
        const li = document.createElement('li');
        if (detail) li.className = 'ligne-jour';
        li.innerHTML = `<span class="jour">${jourCourt(jour)}</span>
            <span class="emoji">${info.emoji}</span>
            <strong>${degres(data.daily.temperature_2m_max[i])}</strong>
            <span class="min">${degres(data.daily.temperature_2m_min[i])}</span>
            ${detail ? `<span class="desc">${info.texte}</span>` : ''}`;
        conteneur.appendChild(li);
    });
}

function verifierAlertes(lieu, data) {
    const r = reglages();
    if (!r.notifications || !('Notification' in window) || Notification.permission !== 'granted') return;
    const c = data.current;
    const tempC = r.unitTemp === 'F' ? (c.temperature_2m - 32) * 5 / 9 : c.temperature_2m;
    const ventKmh = c.wind_speed_10m * ({ kmh: 1, ms: 3.6, mph: 1.609 }[r.unitVent]);
    let message = null;
    if (c.weather_code >= 95) message = 'Orage en cours';
    else if (tempC >= 40) message = 'Chaleur extrême';
    else if (tempC <= -5) message = 'Froid extrême';
    else if (ventKmh >= 60) message = 'Vent violent';
    if (!message) return;

    const cle = `${lieu.nom}|${c.time.slice(0, 10)}|${message}`;
    if (lire(CLES.alerte, '') === cle) return;
    ecrire(CLES.alerte, cle);
    try {
        new Notification(`MétéoFlash · ${lieu.nom}`, { body: `${message} (${degres(c.temperature_2m)})` });
    } catch (e) { /* notifications bloquées : on ignore */ }
}

async function afficherAccueil(lieu) {
    try {
        const data = await chargerMeteo(lieu);
        const r = reglages();
        const c = data.current;
        const info = infoMeteo(c.weather_code, c.is_day === 1);

        ecrire(CLES.lieu, lieu);
        $('nom-ville').textContent = lieu.nom;
        $('date-heure').textContent = `${dateLongue(c.time)} • ${formaterHeure(c.time)}`;
        $('icone-principale').textContent = info.emoji;
        $('temperature').textContent = Math.round(c.temperature_2m);
        const unite = document.querySelector('.temperature sup');
        if (unite) unite.textContent = `°${r.unitTemp}`;
        $('description').textContent = info.texte;
        $('humidite').textContent = `${c.relative_humidity_2m}%`;
        $('vent').textContent = `${Math.round(c.wind_speed_10m)} ${LIBELLE_VENT[r.unitVent]}`;
        $('lever').textContent = formaterHeure(data.daily.sunrise[0]);
        $('coucher').textContent = formaterHeure(data.daily.sunset[0]);

        rendreHoraireAccueil(data);
        rendreJours(data);
        majBoutonFavori(lieu);
        verifierAlertes(lieu, data);
    } catch (e) {
        console.error(e);
        toast('Impossible de récupérer la météo. Vérifiez votre connexion.');
    }
}

function demarrerAccueil(lieu) {
    clearInterval(rafraichissement);
    afficherAccueil(lieu);
    rafraichissement = setInterval(() => afficherAccueil(lieu), 10 * 60 * 1000);   // toutes les 10 min
}

async function pageAccueil() {
    accueilActif = demarrerAccueil;

    // Clic sur l'épingle : revenir à ma position
    const epingle = document.querySelector('.actuelle .lieu > svg');
    if (epingle) {
        epingle.style.cursor = 'pointer';
        epingle.setAttribute('aria-label', 'Utiliser ma position');
        epingle.addEventListener('click', () => {
            localStorage.removeItem(CLES.ville);
            location.reload();
        });
    }

    try {
        let lieu = lire(CLES.ville, null);                     // 1. ville choisie
        if (!lieu && reglages().geo) lieu = await positionGeo();   // 2. géolocalisation
        if (!lieu) lieu = await lieuParDefaut();                // 3. ville par défaut
        if (lieu) demarrerAccueil(lieu);
        else toast('Aucune ville trouvée');
    } catch (e) {
        console.error(e);
        toast('Impossible de récupérer la météo. Vérifiez votre connexion.');
    }
}

/* ---------- 8. PAGE FAVORIS ---------- */
function creerCarteFavori(fav) {
    const article = document.createElement('article');
    article.className = 'carte-ville';
    article.innerHTML = `
        <a href="acceuil.html" class="carte-ville-lien" aria-label="Voir la météo de ${echapper(fav.nom)}">
            <div class="carte-ville-nom"><h2>${echapper(fav.nom)}</h2><p>${echapper(fav.pays)}</p></div>
            <div class="carte-ville-temp"><span class="emoji">…</span><span class="temp">–<sup>°${reglages().unitTemp}</sup></span></div>
            <div class="carte-ville-detail"><span>Chargement…</span><span></span></div>
        </a>
        <button type="button" class="btn-favori" aria-label="Retirer ${echapper(fav.nom)} des favoris" title="Retirer des favoris">${ICONE_ETOILE}</button>`;

    article.querySelector('.carte-ville-lien').addEventListener('click', () => ecrire(CLES.ville, fav));
    article.querySelector('.btn-favori').addEventListener('click', () => {
        basculerFavori(fav);
        article.remove();
        messageFavorisVide();
    });
    return article;
}

async function remplirCarteFavori(article, fav) {
    try {
        const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams(Object.assign({
            latitude: fav.latitude,
            longitude: fav.longitude,
            current: 'temperature_2m,weather_code,is_day',
            daily: 'temperature_2m_max,temperature_2m_min',
            timezone: 'auto',
            forecast_days: 1
        }, parametresUnites()));
        const data = await (await fetch(url)).json();
        const info = infoMeteo(data.current.weather_code, data.current.is_day === 1);
        article.querySelector('.emoji').textContent = info.emoji;
        article.querySelector('.temp').innerHTML = `${Math.round(data.current.temperature_2m)}<sup>°${reglages().unitTemp}</sup>`;
        const lignes = article.querySelectorAll('.carte-ville-detail span');
        lignes[0].textContent = info.texte;
        lignes[1].textContent = `Max ${degres(data.daily.temperature_2m_max[0])} · Min ${degres(data.daily.temperature_2m_min[0])}`;
    } catch (e) {
        article.querySelector('.carte-ville-detail span').textContent = 'Météo indisponible';
    }
}

function messageFavorisVide() {
    const grille = $('liste-favoris');
    let msg = grille.querySelector('.vide');
    const vide = grille.querySelectorAll('.carte-ville:not(.ajout)').length === 0;
    if (vide && !msg) {
        msg = document.createElement('p');
        msg.className = 'vide';
        msg.textContent = "Aucun favori pour l'instant. Cherchez une ville, puis cliquez sur l'étoile.";
        grille.insertBefore(msg, grille.firstChild);
    } else if (!vide && msg) {
        msg.remove();
    }
}

function pageFavoris() {
    const grille = $('liste-favoris');
    const ajout = grille.querySelector('.ajout');
    grille.querySelectorAll('.carte-ville:not(.ajout)').forEach((c) => c.remove());   // retire les exemples

    listeFavoris().forEach((fav) => {
        const carte = creerCarteFavori(fav);
        grille.insertBefore(carte, ajout);
        remplirCarteFavori(carte, fav);
    });
    messageFavorisVide();
}

/* ---------- 9. PAGE PRÉVISIONS HORAIRES ---------- */
function ligneHoraire(data, i, avecJour) {
    const t = data.hourly.time[i];
    const info = infoMeteo(data.hourly.weather_code[i], data.hourly.is_day[i] === 1);
    const pluie = data.hourly.precipitation_probability[i] ?? 0;
    const vent = Math.round(data.hourly.wind_speed_10m[i]);
    const libelle = avecJour ? `${jourSemaine(t)} ${formaterHeure(t)}` : formaterHeure(t);
    return `<li class="ligne-horaire"><span class="h">${libelle}</span>
        <span class="emoji">${info.emoji}</span>
        <strong>${degres(data.hourly.temperature_2m[i])}</strong>
        <span class="pluie">${ICONE_GOUTTE} ${pluie}%</span>
        <span class="vent">${ICONE_VENT} ${vent} ${LIBELLE_VENT[reglages().unitVent]}</span></li>`;
}

async function pageHoraires() {
    try {
        const lieu = await lieuCourant();
        if (!lieu) return toast('Aucune ville trouvée');
        const data = await chargerMeteo(lieu);
        const debut = indexHeure(data);
        const total = data.hourly.time.length;

        $('nom-ville').textContent = lieu.nom;
        $('date-heure').textContent = dateLongue(data.current.time);

        // Aujourd'hui : les 12 prochaines heures
        let html = '';
        for (let i = debut; i < debut + 12 && i < total; i++) html += ligneHoraire(data, i, false);
        document.querySelector('#panneau-auj .detail-liste').innerHTML = html;

        // Demain : toutes les 3 heures
        const demain = data.daily.time[1];
        html = '';
        for (let i = 0; i < total; i++) {
            const t = data.hourly.time[i];
            if (t.startsWith(demain) && dateDepuisISO(t).getHours() % 3 === 0) html += ligneHoraire(data, i, false);
        }
        document.querySelector('#panneau-dem .detail-liste').innerHTML = html;

        // 3 jours : toutes les 6 heures
        html = '';
        for (let i = debut; i < debut + 72 && i < total; i += 6) html += ligneHoraire(data, i, true);
        document.querySelector('#panneau-3j .detail-liste').innerHTML = html;
    } catch (e) {
        console.error(e);
        toast('Impossible de récupérer la météo. Vérifiez votre connexion.');
    }
}

/* ---------- 10. PAGE PRÉVISIONS SUR 7 JOURS ---------- */
async function pageSeptJours() {
    try {
        const lieu = await lieuCourant();
        if (!lieu) return toast('Aucune ville trouvée');
        const data = await chargerMeteo(lieu);
        $('nom-ville').textContent = lieu.nom;
        rendreJours(data);
    } catch (e) {
        console.error(e);
        toast('Impossible de récupérer la météo. Vérifiez votre connexion.');
    }
}

/* ---------- 11. PAGE CARTE ---------- */
function urlWindy(couche, lieu) {
    const r = reglages();
    return 'https://embed.windy.com/embed.html?' + new URLSearchParams({
        type: 'map',
        location: 'coordinates',
        metricRain: 'mm',
        metricTemp: r.unitTemp === 'F' ? '°F' : '°C',
        metricWind: LIBELLE_VENT[r.unitVent],
        zoom: 6,
        overlay: couche,
        product: 'ecmwf',
        level: 'surface',
        lat: Number(lieu.latitude).toFixed(2),
        lon: Number(lieu.longitude).toFixed(2),
        detailLat: Number(lieu.latitude).toFixed(2),
        detailLon: Number(lieu.longitude).toFixed(2),
        marker: 'true',
        message: 'true'
    });
}

async function pageCarte() {
    try {
        const lieu = await lieuCourant();
        if (!lieu) return;
        const liens = document.querySelectorAll('.chips .chip');
        liens.forEach((a) => {
            const couche = new URL(a.href).searchParams.get('overlay');
            a.href = urlWindy(couche, lieu);
        });
        const actif = document.querySelector('.chips .chip.actif') || liens[0];
        document.querySelector('iframe[name="carte-meteo"]').src = actif.href;
        const sousTitre = document.querySelector('.page-sous-titre');
        if (sousTitre) sousTitre.textContent = `Température, pluie, vent et nuages · ${lieu.nom}`;
    } catch (e) {
        console.error(e);
    }
}

/* ---------- 12. PAGE PARAMÈTRES ---------- */
function pageParametres() {
    let r = reglages();

    const choix = (idA, idB, premier) => {
        $(idA).classList.toggle('active', premier);
        $(idB).classList.toggle('active', !premier);
        $(idA).setAttribute('aria-pressed', String(premier));
        $(idB).setAttribute('aria-pressed', String(!premier));
    };

    function afficher() {
        choix('unit-celsius', 'unit-fahrenheit', r.unitTemp === 'C');
        choix('hour-24', 'hour-12', r.heure24);
        $('unit-wind').value = r.unitVent;
        $('notif-toggle').checked = r.notifications;
        $('geo-toggle').checked = r.geo;
        $('default-city').value = r.villeDefaut;
        appliquerTheme(lire(CLES.theme, false) === true, false);   // met à jour les boutons Sombre / Clair
    }

    // Chaque réglage est enregistré immédiatement (le bouton Enregistrer reste utile pour la ville par défaut)
    function enregistrer(message = 'Paramètres enregistrés ✓') {
        const avant = { geo: r.geo, ville: r.villeDefaut };
        r.unitVent = $('unit-wind').value;
        r.notifications = $('notif-toggle').checked;
        r.geo = $('geo-toggle').checked;
        r.villeDefaut = $('default-city').value.trim() || REGLAGES_DEFAUT.villeDefaut;

        // Si la géolocalisation ou la ville par défaut change, on oublie la ville
        // choisie avant : l'accueil appliquera alors le nouveau réglage.
        if (avant.geo !== r.geo || avant.ville !== r.villeDefaut) {
            localStorage.removeItem(CLES.ville);
            localStorage.removeItem(CLES.lieu);
        }
        ecrire(CLES.reglages, r);
        afficher();
        toast(message);
    }

    $('unit-celsius').addEventListener('click', () => { r.unitTemp = 'C'; enregistrer(); });
    $('unit-fahrenheit').addEventListener('click', () => { r.unitTemp = 'F'; enregistrer(); });
    $('hour-24').addEventListener('click', () => { r.heure24 = true; enregistrer(); });
    $('hour-12').addEventListener('click', () => { r.heure24 = false; enregistrer(); });
    $('unit-wind').addEventListener('change', () => enregistrer());
    $('geo-toggle').addEventListener('change', () => enregistrer());
    $('notif-toggle').addEventListener('change', async () => {
        enregistrer();
        if ($('notif-toggle').checked && 'Notification' in window && Notification.permission === 'default') {
            try { await Notification.requestPermission(); } catch (e) { /* ignoré */ }
        }
    });

    $('save-settings').addEventListener('click', () => enregistrer());

    $('reset-settings').addEventListener('click', () => {
        r = Object.assign({}, REGLAGES_DEFAUT);
        ecrire(CLES.reglages, r);
        appliquerTheme(false);
        afficher();
        toast('Paramètres réinitialisés');
    });

    afficher();
}

/* ---------- 13. DÉMARRAGE : on lance ce que la page contient ---------- */
document.addEventListener('DOMContentLoaded', () => {
    initialiserTheme();
    initialiserRecherche();

    if ($('save-settings')) pageParametres();
    if ($('liste-favoris')) pageFavoris();
    if (document.querySelector('iframe[name="carte-meteo"]')) pageCarte();
    if ($('panneau-auj')) pageHoraires();
    if ($('liste-jours') && $('liste-jours').classList.contains('detail-liste')) pageSeptJours();
    if ($('liste-horaire') && document.querySelector('.actuelle')) pageAccueil();
});