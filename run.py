import os
from app import app

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("♥ Chess for Luvvrs — by Chris Dcruz")
    app.run(host='0.0.0.0', port=port, debug=False)
```

**File 4 — `engine.py`**

Click "Add file" → "Create new file" → name it `engine.py` → paste the full engine code from the `engine.py` file I gave you.

---

### Step 3 — Create the `templates/` folder with `index.html`

On GitHub, click **"Add file"** → **"Create new file"**

In the filename box type:
```
templates/index.html
```

Typing the `/` automatically creates the folder. Paste your full `index.html` content in there.

---

### Step 4 — Create the `static/` folder structure

**Add file** → **Create new file** → name it:
```
static/css/style.css
```
Paste your full CSS content.

**Add file** → **Create new file** → name it:
```
static/js/game.js
```
Paste your full JS content.

---

### Step 5 — Your final repo structure must look like this:
```
Chess-for-luvvrs/
├── app.py
├── engine.py
├── run.py
├── requirements.txt
├── Procfile
├── templates/
│   └── index.html
└── static/
    ├── css/
    │   └── style.css
    └── js/
        └── game.js