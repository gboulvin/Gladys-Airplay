# AirPlay

Diffusez des notifications vocales, des carillons et des fichiers audio sur
vos enceintes AirPlay depuis Gladys : HomePod et HomePod mini, Apple TV,
AirPort Express, et les enceintes et amplis tiers compatibles AirPlay ou
AirPlay 2 (Sonos, Bose, Denon/Marantz, Yamaha, Bang & Olufsen, Libratone…).

Cette intégration remplace le service AirPlay intégré à Gladys et ajoute un
volume par enceinte, des carillons intégrés, des actions et déclencheurs de
scène et un widget de tableau de bord.

## Où l'utiliser

- **Pays :** partout. L'intégration dialogue avec les enceintes sur votre
  réseau local uniquement ; elle ne dépend d'aucun pays, compte fabricant ni
  service en ligne.
- **Réseau :** les enceintes doivent être sur le **même réseau local** (même
  sous-réseau) que le serveur Gladys. Une enceinte sur un Wi-Fi invité, un
  VLAN séparé ou derrière un VPN n'est pas trouvée.
- **Internet :** inutile pour jouer un carillon, un fichier ou un flux de
  votre réseau local. Les notifications vocales utilisent la voix de synthèse
  choisie dans Gladys : **Gladys Plus** par défaut (internet requis), ou une
  intégration de synthèse vocale locale.
- **Langues :** anglais, français, allemand et espagnol.

## Prérequis

- Gladys Assistant **5.3.0 ou plus récent**.
- Dans l'app **Maison** de votre iPhone (Réglages de la maison > **Enceintes
  et TV**), **Autoriser l'accès aux enceintes et TV** doit valoir **Tout le
  monde** ou **Toute personne sur le même réseau**. « Seulement les personnes
  qui partagent ce domicile » bloque Gladys.
- Si vous avez défini un mot de passe AirPlay, saisissez-le dans la
  configuration.

## Installation

1. Installez **AirPlay** depuis le catalogue des intégrations de Gladys.
2. Ouvrez l'onglet **Découverte** : vos enceintes apparaissent en quelques
   secondes. Cliquez sur **Créer** pour chaque enceinte à ajouter.
3. Utilisez le bouton **Tester une enceinte** de l'onglet **Configuration** :
   l'enceinte choisie joue un carillon à deux tons.

### Depuis le service AirPlay intégré

Les enceintes du service intégré et celles de cette intégration sont des
appareils différents. Une fois vos enceintes créées ici :

1. Modifiez vos scènes qui utilisent **Jouer une notification** et
   choisissez les nouvelles enceintes.
2. Supprimez les anciennes enceintes de l'intégration AirPlay intégrée.

## Configuration

| Réglage                               | Défaut      | Effet                                                                                            |
| ------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| **Volume par défaut (%)**             | 70          | Volume d'une enceinte dont le volume n'a jamais été réglé dans Gladys.                           |
| **Durée maximale (s)**                | 300         | Toute lecture est arrêtée après cette durée (10 à 1 800 s).                                      |
| **Vérification de disponibilité (s)** | 300         | Fréquence de vérification des enceintes (60 à 3 600 s). Alimente les déclencheurs hors/en ligne. |
| **Protocole AirPlay**                 | Automatique | Automatique lit ce que chaque enceinte annonce. Forcez AirPlay 1 pour un ancien récepteur muet.  |
| **Nom de l'émetteur**                 | Gladys      | Nom affiché par les enceintes qui indiquent qui diffuse.                                         |
| **Mot de passe AirPlay**              | _(vide)_    | Uniquement pour les enceintes protégées par un mot de passe.                                     |

## Vos enceintes dans Gladys

Chaque enceinte est un appareil avec quatre fonctionnalités :

- **Notification** — utilisée par l'action de scène **Jouer une
  notification** de Gladys : le texte est transformé en voix et joué sur
  l'enceinte.
- **Volume** — le volume de lecture de Gladys (0 à 100 %). AirPlay ne sait
  pas lire le volume d'une enceinte au repos : c'est donc un réglage propre à
  Gladys, conservé par enceinte ; le modifier pendant une lecture l'applique
  immédiatement.
- **État de lecture** — en lecture ou inactive.
- **Lecture en cours** — ce que Gladys joue.

La carte de l'appareil affiche un badge **local** quand l'enceinte répond, et
**injoignable** sinon.

## Scènes

### Actions

- **Jouer une notification** (intégrée à Gladys) — prononce un texte sur une
  enceinte.
- **Jouer une URL audio sur AirPlay** — joue un fichier son ou un flux (MP3,
  AAC, WAV, OGG, FLAC, radio internet…) depuis une adresse `http://` ou
  `https://`, à un volume facultatif. Avec **Attendre la fin**, la scène
  attend la fin de l'audio (100 s au plus). Sorties : **Lecture démarrée** et
  **Durée jouée**.
- **Jouer un carillon sur AirPlay** — un son intégré : **Sonnette**,
  **Notification** ou **Alerte**. Il ne demande ni internet ni synthèse
  vocale : idéal pour une sonnette ou une alarme.
- **Arrêter la lecture AirPlay** — arrête ce que Gladys joue sur une enceinte.

Une enceinte qui ne répond pas n'interrompt pas la scène : **Lecture
démarrée** vaut alors faux, utilisez-la dans une condition pour envoyer un
message à la place.

### Déclencheurs

- **Enceinte AirPlay hors ligne** — une enceinte ne répond plus (débranchée,
  Wi-Fi perdu…).
- **Enceinte AirPlay de retour en ligne** — une enceinte répond de nouveau.

Laissez l'enceinte vide pour réagir à n'importe laquelle. Le nom de
l'enceinte est disponible via `{{triggerEvent.data.name}}`. La détection suit
l'intervalle de **Vérification de disponibilité**.

## Tableau de bord

Ajoutez le widget **Enceintes AirPlay** :

- sans enceinte choisie, il liste vos enceintes avec leur état (joignable,
  injoignable, en lecture) et un bouton **Vérifier** ;
- avec une enceinte choisie, il affiche son volume, son état, son adresse et
  son protocole, et des boutons **Carillon**, **Jouer une URL** et
  **Arrêter**.

## Limites

- Audio uniquement : pas de vidéo ni de recopie d'écran.
- Une enceinte par lecture : pas de multiroom synchronisé.
- Gladys ne transmet pas aux intégrations externes le volume choisi dans
  **Jouer une notification** : la notification est jouée au **Volume** de
  l'enceinte. Pour parler plus ou moins fort dans une scène, réglez d'abord
  le volume avec une action **Contrôler un appareil**.
- Gladys diffuse dans sa propre session AirPlay : une lecture interrompt ce
  que jouait l'enceinte (Apple Music, Spotify…), qui ne reprend pas ensuite.
- L'intégration tourne dans un conteneur Docker. Certains récepteurs AirPlay
  2 doivent joindre l'émetteur en retour pour synchroniser leur horloge : si
  une enceinte est trouvée et testée mais reste muette, essayez **AirPlay 1
  (RAOP)** dans la configuration.
- Un Apple TV ou un HomePod réglé sur « Seulement les personnes qui partagent
  ce domicile » refuse Gladys (voir les prérequis).

## Dépannage

| Symptôme                                 | Que faire                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Aucune enceinte dans l'onglet Découverte | Vérifiez que l'enceinte est allumée et sur le même réseau que Gladys, puis rouvrez l'onglet.                  |
| « L'enceinte ne répond pas »             | Réveillez l'enceinte (lancez une lecture depuis votre téléphone), vérifiez que son adresse IP n'a pas changé. |
| « L'enceinte demande un mot de passe »   | Saisissez le mot de passe AirPlay dans la configuration.                                                      |
| « L'enceinte a refusé l'appairage »      | App Maison > Réglages de la maison > Enceintes et TV > autorisez tout le monde sur le même réseau.            |
| La notification est jouée sans voix      | Vérifiez la voix choisie dans Gladys (réglages Intelligence artificielle) et son abonnement.                  |
| Le carillon de test reste muet           | Réglez le protocole sur **AirPlay 1 (RAOP)**, ou **AirPlay 2**, et testez à nouveau.                          |

L'intégration journalise chaque lecture (enceinte, adresse, protocole, cause
d'un échec) dans son onglet **Journaux**.
