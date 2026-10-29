# Patente C — Quiz vocal (appli publique)

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

## Comment poser les questions
- **Vrai/faux** : dis l'affirmation. « Le conducteur doit avoir 21 ans pour la patente C. »
- **QCM** : dis la question, puis « A … B … C … ». La reconnaissance vocale lit parfois mal les lettres : tu peux aussi écrire.
- Réglages → langue (français, italien, anglais, arabe) pour la voix et les réponses.

## Fiabilité
- L'appli ne répond **Oui/Non/lettre** que si un passage de la base l'appuie nettement. Sinon elle dit
  « je ne peux pas trancher » et montre les passages les plus proches.
- Elle compare des mots et des chiffres, elle ne « comprend » pas : une affirmation formulée très différemment
  du cours, ou avec un piège de sens, peut échapper à la détection. Lis toujours le passage cité.
- Les questions de `quiz/quiz.json` sont prioritaires et exactes. Les exemples fournis sont à remplacer.

## Contenus locaux (facultatif)
« Charger mes fichiers » ajoute des `.json` (format `quiz/quiz.json`) ou des `.txt` / `.md` (cours) qui restent sur le téléphone.
