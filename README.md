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

## Plusieurs matières
Réglages → **Ajouter une base** : une base = un dépôt privé (patente, maths…). Un menu apparaît en haut pour passer de l'une à l'autre.
Chaque base a sa langue, ses données et ses fichiers locaux : rien ne se mélange.

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
- Les quiz viennent de ta base privée. `quiz/quiz.json` n'est qu'une démo, affichée tant qu'aucune base n'est configurée.

## Contenus locaux (facultatif)
« Charger mes fichiers » ajoute des `.json` (format `quiz/quiz.json`) ou des `.txt` / `.md` (cours) qui restent sur le téléphone.
