# Patente C CQC (Italie) — Quiz vocal (appli publique)

Pose une question à voix haute (ou écris-la). L'appli répond **Vrai/Faux** (Oui/Non) pour une affirmation, ou
**donne la bonne lettre** pour un QCM, en s'appuyant sur ta base de connaissances, et cite toujours la source.
100 % gratuit, aucune IA externe : la recherche et la décision tournent dans le navigateur.

Ce dépôt ne contient **aucun contenu privé** : seulement l'appli et quelques questions d'exemple.

## Mise en ligne (une fois, dans Termux)
```bash
mkdir -p ~/Patente-C-app && cd ~/Patente-C-app
unzip -o ~/storage/downloads/Patente-C-app.zip
git init -b main && git add . && git commit -m "Appli quiz vocal"
gh repo create Patente-C-app --public --source=. --push
gh api -X POST repos/MaxMcNeil/Patente-C-app/pages -f "source[branch]=main" -f "source[path]=/"
```
Puis ouvre `https://MaxMcNeil.github.io/Patente-C-app/` dans Chrome → menu ⋮ → **Installer l'application**.

## Brancher la base privée
Réglages → dépôt `MaxMcNeil/Patente-C-base`, branche `main`, jeton en lecture seule → **Enregistrer et synchroniser**.
La base est ensuite gardée sur le téléphone (elle fonctionne hors connexion jusqu'à la prochaine synchronisation).
Voir le README du dépôt privé pour créer le jeton et alimenter la base.

## Plusieurs matières
Réglages → **Ajouter une base** : une base = un dépôt privé (patente, maths…). Un menu apparaît en haut pour passer de l'une à l'autre.
Chaque base a sa langue, ses données et ses fichiers locaux : rien ne se mélange.

## Comprendre le sens (facultatif)
Sans cette option, l'appli cherche par les **mots** : si tu poses la question autrement que le cours, elle peut répondre « je ne peux pas trancher ».
Avec **Réglages → Comprendre le sens**, un petit modèle multilingue (italien, français, anglais, arabe) tourne **dans le téléphone** :
gratuit, sans serveur, sans clé. Il est téléchargé une fois (~120 Mo, Wi-Fi conseillé) depuis le dépôt public Hugging Face, puis gardé sur le téléphone.
Les fichiers du moteur sont dans `vendor/` (rien d'autre n'est chargé depuis Internet).

Le sens ne décide jamais seul : il sert à **retrouver le bon passage** et à le rapprocher de ta phrase. Les **chiffres**, les
**négations** et l'**autorité des sources** sont toujours contrôlés comme avant. Une réponse trouvée par le sens est signalée
(« Trouvé par le sens, pas par les mots : relis bien le passage ») et n'a jamais la confiance « haute ».

**Avant de t'y fier : ouvre `test-sens.html`** (bouton dans Réglages). Il compare des phrases de même sens, de même sujet mais d'un autre fait,
et sans rapport, vérifie que le modèle les sépare, et propose le **seuil** à utiliser. Si le test dit « séparation insuffisante », laisse l'option désactivée.
Limite connue : les modèles de sens confondent parfois des contraires (« augmente » / « diminue ») ; relis toujours le passage cité.

## IA gratuite pour comprendre tes questions (facultatif)
Tu poses ta question à ta manière ; une IA gratuite la **reformule** avec les mots du cours, et l'appli cherche et vérifie la réponse dans TES sources.
- **Ce qui part sur Internet : uniquement ta phrase**, vers le fournisseur choisi (Google AI Studio ou Groq). Jamais ta base, jamais un passage de cours.
- **L'IA ne répond jamais.** Une reformulation est refusée si elle change un chiffre, une unité ou une négation. Les reformulations acceptées sont
  essayées en plus de ta phrase d'origine ; si elles aboutissent à des réponses différentes, l'appli ne tranche pas.
- La réponse montre « Question comprise comme : … » pour que tu voies ce que l'IA a compris.
- Pour un QCM mal dicté (les lettres A, B, C mal reconnues), l'IA remet les options en ordre ; elle ne peut pas changer leurs chiffres.
- Si l'IA est indisponible (quota, réseau, clé), l'appli retombe sur la recherche classique et le dit.

Mise en place : crée une clé gratuite chez le fournisseur (Google AI Studio : aistudio.google.com ; Groq : console.groq.com), colle-la dans
Réglages → IA gratuite, puis **Tester la clé**. Si le modèle proposé n'existe plus, le test affiche les modèles disponibles : recopie-en un.
Les offres gratuites ont des limites de requêtes qui peuvent changer sans préavis, et leurs conditions sur l'usage des données varient : lis-les.

## Écoute permanente (le bouton rond)

Touche le bouton rond une fois : l'appli écoute en continu, répond **en italien** à voix haute, puis se remet à écouter, pour un nombre illimité de questions. Les silences ne l'arrêtent jamais. Pour arrêter : touche de nouveau le bouton, ou dis « stop », « basta » ou « ferma » (phrase de trois mots au plus, pour qu'une question contenant « fine » ne l'arrête pas). La langue par défaut est l'italien.
- L'écran reste allumé tant que l'écoute est active.
- **Limite du web** : écran verrouillé ou appli en arrière-plan, Android coupe le micro d'une page web. L'écoute se met en pause et reprend dès que tu reviens sur l'appli. Pour écouter écran verrouillé, il faut une vraie appli Android.
- Chrome Android émet un petit bip à chaque redémarrage de l'écoute : normal.

**Clé de secours** : dans Réglages, renseigne la clé du fournisseur principal (Gemini) et, en dessous, celle de l'autre (Groq). Si Gemini est en panne, sans quota ou trop lent, l'appli passe seule sur Groq. « Tester les clés » vérifie les deux.

**L'IA répond seule** (case cochée par défaut avec l'IA) : ta question est envoyée à Gemini, sinon à Groq, qui répond avec ses propres connaissances, en italien, et l'appli la lit à voix haute. Sa réponse est prioritaire et marquée « Réponse de l'IA, non vérifiée dans ta base ». Si ta base dit autre chose, une note l'indique à l'écrit, sans être lue. Si les deux fournisseurs sont en panne ou sans quota, l'appli répond avec ta base. Décoche la case pour revenir à une réponse 100 % tirée de ta base.

**Choix automatique du modèle** : l'appli lit la liste des modèles que ta clé peut utiliser, ne garde que les modèles de texte (jamais voix, image, garde-fou), les classe du plus récent au moins utile et essaie jusqu'à 5 modèles. Un modèle retiré (404), en quota (429) ou refusé est sauté ; si tous échouent, elle passe au fournisseur de secours, puis à ta base. Le modèle qui marche est retenu. « Tester les clés » indique lequel.

**Téléphones lents** : l'index de recherche se calcule par petites tranches (l'écran ne gèle plus) et une seule fois par version de la base. Mode sans échec : ajoute `?safe=1` à l'adresse. Bouton « Réparer l'appli » dans Réglages.

## Comment poser les questions
- **Vrai/faux** : dis l'affirmation. « Le conducteur doit avoir 21 ans pour la patente C. »
- **QCM** : dis la question, puis « A … B … C … ». La reconnaissance vocale lit parfois mal les lettres : tu peux aussi écrire.
- Réglages → langue (français, italien, anglais, arabe) pour la voix et les réponses.

## Fiabilité
- **Sources qui se contredisent** : l'appli applique l'autorité (`officiel` > `vérifié` > `non vérifié`). À rang égal elle refuse de
  trancher et montre les deux passages. Quand elle répond alors qu'une source dit le contraire, elle l'affiche.
- **Mode strict** (Réglages) : ne conclut qu'avec une source `officiel` ou `vérifié`.
- Confiance affichée : haute / moyenne / basse (une seule source non vérifiée).
- Si le passage trouvé contient `[…]` (mot que l'OCR n'a pas pu lire), l'appli refuse de conclure et te montre le passage.
- L'appli ne répond **Oui/Non/lettre** que si un passage de la base l'appuie nettement. Sinon elle dit
  « je ne peux pas trancher » et montre les passages les plus proches.
- Elle compare des mots et des chiffres, elle ne « comprend » pas : une affirmation formulée très différemment
  du cours, ou avec un piège de sens, peut échapper à la détection. Lis toujours le passage cité.
- Les quiz viennent de ta base privée (réponse exacte uniquement si les **chiffres et la négation** de ta phrase sont identiques à ceux de la question : sinon l'appli n'applique pas la réponse d'une phrase voisine). `quiz/quiz.json` n'est qu'une démo, affichée tant qu'aucune base n'est configurée.

## Contenus locaux (facultatif)
« Charger mes fichiers » ajoute des `.json` (format `quiz/quiz.json`) ou des `.txt` / `.md` (cours) qui restent sur le téléphone.


## Appli Android (écoute même écran verrouillé)

Dossier `android/` : une enveloppe Android de cette même appli web. Le micro et la voix passent par un service au premier plan (notification « Patente C : écoute active »), ce qui permet d'écouter et de répondre écran verrouillé. Tout le reste (base, clés IA, réponses) est l'appli web habituelle, chargée depuis `https://maxmcneil.github.io/Patente-C-app/` : une mise à jour de l'appli web s'applique sans réinstaller l'APK.

**Construire l'APK** (jamais automatique) : GitHub > onglet Actions > « Appli Android (APK) » > Run workflow. L'APK apparaît dans Releases (tag `android-latest`). Il est signé avec une clé fixe : les versions suivantes s'installent par-dessus.

**Au premier lancement** : autorise le micro et les notifications, et accepte l'exemption d'économie de batterie (sinon Android peut couper l'écoute écran éteint). Touche le bouton rond : l'écoute est permanente. Arrêt : bouton rond, « stop », ou « Arrêter » dans la notification.

La reconnaissance vocale utilise celle de Google sur le téléphone (réseau nécessaire). Le bip de début d'écoute est coupé.
