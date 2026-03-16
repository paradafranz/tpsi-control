# E-Commerce Distribuito

Progetto di **Architetture Distribuite** sviluppato con:

- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Backend:** Node.js + Express
- **Persistenza dati:** file `.json` nel backend
- **Deploy backend:** Render
- **Deploy frontend:** GitHub Pages

## Descrizione

Il progetto simula un piccolo **e-commerce distribuito** con due viste separate:

- **Vista Utente**
  - visualizza il proprio saldo crediti
  - visualizza il catalogo prodotti
  - può acquistare un prodotto
- **Vista Admin**
  - può aggiungere nuovi prodotti
  - può modificare lo stock dei prodotti
  - può assegnare crediti bonus agli utenti

L’architettura è di tipo **client-server**, con frontend e backend separati e comunicazione tramite **API REST in JSON**.

---

## Architettura

### Tipo di client
Il client realizzato può essere considerato un **Thick Client leggero**.

Motivazione:
- il **frontend** gestisce interfaccia grafica, eventi utente, login simulato, chiamate `fetch()`, aggiornamento dinamico del DOM e navigazione tra le viste
- il **backend** gestisce la logica di business e la persistenza dei dati

Quindi parte della logica applicativa è lato client, ma i controlli più importanti sono comunque lato server.

### Struttura del progetto

```text
/frontend
/backend
link githubPages:https://paradafranz.github.io/tpsi-verifica/
link render:https://tpsi-verifica.onrender.com