from flask import Flask, jsonify, request, render_template, redirect, url_for
import requests, sqlite3, webbrowser, os, json

# Try to import Translator from googletrans; degrade gracefully if unavailable
try:
    from googletrans import Translator
    translator = Translator()
except Exception:
    Translator = None
    translator = None

# Try to setup Gemini LLM for Tanglish to English
try:
    import google.generativeai as genai
    # Use environment variable for API Key
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
    if GEMINI_API_KEY:
        genai.configure(api_key=GEMINI_API_KEY)
        gemini_model = genai.GenerativeModel('gemini-2.5-flash')
    else:
        gemini_model = None
except ImportError:
    gemini_model = None

app = Flask(__name__)
DB_PATH = "reviews.db"

# ---------- INITIAL DATABASE ----------
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            message TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            email TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sos_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            latitude REAL,
            longitude REAL,
            address TEXT
        )
    """)
    # Add a default admin user if not exists
    cursor.execute("INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)", ('admin', '1234'))
    conn.commit()
    conn.close()

init_db()

# ---------- HELPER: Export to Text File ----------
def export_to_textfile():
    """Exports DB content to a readable table format in a text file."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        with open("DATABASE_LOG.txt", "w", encoding="utf-8") as f:
            f.write("==================================================================================\n")
            f.write("                             MOBILITY ASSISTANCE DATABASE                         \n")
            f.write("==================================================================================\n\n")
            
            # --- USERS TABLE ---
            f.write("REGISTERED USERS\n")
            f.write(f"{'ID':<5} | {'USERNAME':<20} | {'PASSWORD':<15} | {'EMAIL'}\n")
            f.write("-" * 80 + "\n")
            
            cursor.execute("SELECT id, username, password, email FROM users")
            users = cursor.fetchall()
            if users:
                for u in users:
                    uid = str(u[0])
                    name = str(u[1]) if u[1] else ""
                    pwd = str(u[2]) if u[2] else ""
                    eml = str(u[3]) if u[3] else ""
                    f.write(f"{uid:<5} | {name:<20} | {pwd:<15} | {eml}\n")
            else:
                f.write("(No users found)\n")
            f.write("-" * 80 + "\n\n")
            
            cursor.execute("SELECT id, username, message FROM reviews")
            reviews = cursor.fetchall()
            if reviews:
                for r in reviews:
                    rid = str(r[0])
                    rname = str(r[1]) if r[1] else "Anonymous"
                    rmsg = str(r[2]).replace("\n", " ") if r[2] else ""
                    f.write(f"{rid:<5} | {rname:<20} | {rmsg}\n")
            else:
                f.write("(No reviews found)\n")
            f.write("-" * 80 + "\n\n")

            # --- SOS ALERTS TABLE ---
            f.write("SOS EMERGENCY ALERTS\n")
            f.write(f"{'ID':<5} | {'TIMESTAMP':<20} | {'USERNAME':<15} | {'LAT, LON':<25} | {'ADDRESS'}\n")
            f.write("-" * 100 + "\n")
            
            cursor.execute("SELECT id, timestamp, username, latitude, longitude, address FROM sos_alerts ORDER BY id DESC")
            sos = cursor.fetchall()
            if sos:
                for s in sos:
                    sid, time, name, lat, lon, addr = s
                    coords = f"{lat:.5f}, {lon:.5f}"
                    f.write(f"{str(sid):<5} | {str(time):<20} | {str(name):<15} | {coords:<25} | {str(addr)}\n")
            else:
                f.write("(No SOS alerts found)\n")
            f.write("-" * 100 + "\n")
        
        conn.close()
    except Exception as e:
        print(f"Error exporting data: {e}")

# ---------- LOGIN ----------
@app.route('/', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ? AND password = ?", (username, password))
        user = cursor.fetchone()
        conn.close()
        
        if user:
            return jsonify({'success': True, 'redirect': url_for('dashboard')})
        else:
            return jsonify({'success': False, 'error': 'Invalid username or password'}), 401
    return render_template('login.html')

# ---------- REGISTER ----------
@app.route('/register', methods=['POST'])
def register():
    username = request.form.get('username')
    password = request.form.get('password')
    email = request.form.get('email')
    
    if not username or not password:
        return jsonify({'success': False, 'error': 'Username and password required'}), 400
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO users (username, password, email) VALUES (?, ?, ?)", (username, password, email))
        conn.commit()
        success = True
    except sqlite3.IntegrityError:
        success = False
    conn.close()
    
    if success:
        export_to_textfile() # <--- Export data immediately
        return jsonify({'success': True, 'message': 'Registration successful! Redirecting to login...', 'redirect': url_for('login')})
    else:
        return jsonify({'success': False, 'error': 'Username already exists'}), 409

# ---------- DASHBOARD ----------
@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

# ---------- REVIEWS ----------
@app.route('/reviews', methods=['GET', 'POST'])
def reviews():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    if request.method == 'POST':
        username = request.form.get('username', 'Anonymous')
        message = request.form.get('message')
        if message:
            cursor.execute("INSERT INTO reviews (username, message) VALUES (?, ?)", (username, message))
            conn.commit()
            export_to_textfile() # <--- Export data immediately

    cursor.execute("SELECT username, message FROM reviews ORDER BY id DESC")
    all_reviews = cursor.fetchall()
    conn.close()

    # Build a simple HTML fragment for reviews to avoid template parsing issues
    from markupsafe import escape
    reviews_fragments = []
    for r in all_reviews:
        uname = escape(r[0]) if r[0] else 'Anonymous'
        msg = escape(r[1]) if r[1] else ''
        reviews_fragments.append(f"<div class=\"review\"><strong>{uname}</strong><br>{msg}</div>")
    reviews_html = "\n".join(reviews_fragments)
    return render_template('reviews_plain.html', reviews_html=reviews_html)

# ---------- NAVIGATION ----------
@app.route('/navigation')
def navigation():
    return render_template('navigation.html')

# ---------- LOGOUT ----------
@app.route('/logout')
def logout():
    return redirect(url_for('login'))

# ---------- OVERPASS API PROXY (Real-Time Data) ----------
@app.route('/api/wheelmap')
def overpass_proxy():
    """
    Fetches real-time accessibility data from OpenStreetMap via Overpass API.
    """
    bbox = request.args.get('bbox')
    if not bbox:
        return jsonify({"error": "No bbox provided"}), 400

    # Convert bbox "min_lon,min_lat,max_lon,max_lat" -> "south,west,north,east"
    try:
        min_lon, min_lat, max_lon, max_lat = map(float, bbox.split(','))
    except ValueError:
        return jsonify({"error": "Invalid bbox format"}), 400

    # Overpass QL Query: Higher limit and prioritizing accessibility tags
    query = f"""
    [out:json][timeout:30];
    (
      node["wheelchair"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["amenity"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["shop"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["tourism"]({min_lat},{min_lon},{max_lat},{max_lon});
      
      way["wheelchair"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["amenity"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["shop"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["building"]({min_lat},{min_lon},{max_lat},{max_lon});
    );
    out center tags 1200;
    """

    overpass_url = "https://overpass-api.de/api/interpreter"
    
    try:
        response = requests.get(overpass_url, params={'data': query}, timeout=15)
        if response.status_code == 200:
            data = response.json()
            return jsonify(data) # Direct pass-through of Overpass JSON
        else:
            return jsonify({"error": "Overpass API failed", "status": response.status_code})
    except Exception as e:
        print(f"Overpass Error: {e}")
        return jsonify({"error": str(e)})


# ---------- GENERIC OVERPASS FETCH (supports unknown tags) ----------
@app.route('/api/osm')
def overpass_generic():
    """
    Generic Overpass proxy: fetches real-time OSM elements inside a bbox.
    Query params:
      - bbox (required): "min_lon,min_lat,max_lon,max_lat"
      - key (optional): tag key to filter (e.g. "amenity"). If omitted, returns all elements in bbox (may be large).
      - limit (optional): integer max results (best-effort, defaults to 500)
    Returns raw Overpass JSON (elements include tags - unknown tags are preserved).
    """
    bbox = request.args.get('bbox')
    if not bbox:
        return jsonify({"error": "No bbox provided"}), 400

    try:
        min_lon, min_lat, max_lon, max_lat = map(float, bbox.split(','))
    except ValueError:
        return jsonify({"error": "Invalid bbox format"}), 400

    key = request.args.get('key')
    try:
        limit = int(request.args.get('limit', 500))
        limit = max(1, min(limit, 2000))
    except ValueError:
        limit = 500

    # Build Overpass QL
    if key:
        # Fetch elements that have the specified key (any value)
        query = f"""
        [out:json][timeout:60];
        (
          node["{key}"]({min_lat},{min_lon},{max_lat},{max_lon});
          way["{key}"]({min_lat},{min_lon},{max_lat},{max_lon});
          relation["{key}"]({min_lat},{min_lon},{max_lat},{max_lon});
        );
        out center tags {limit};
        """
    else:
        # Fetch all elements in bbox (will include elements with unknown tags)
        query = f"""
        [out:json][timeout:60];
        (
          node({min_lat},{min_lon},{max_lat},{max_lon});
          way({min_lat},{min_lon},{max_lat},{max_lon});
          relation({min_lat},{min_lon},{max_lat},{max_lon});
        );
        out center tags {limit};
        """

    overpass_url = "https://overpass-api.de/api/interpreter"
    try:
        resp = requests.get(overpass_url, params={'data': query}, timeout=30)
        if resp.status_code == 200:
            return jsonify(resp.json())
        else:
            return jsonify({"error": "Overpass API failed", "status": resp.status_code}), 502
    except Exception as e:
        print(f"Overpass generic error: {e}")
        return jsonify({"error": str(e)}), 500

# ---------- SOS ALERT RECEIVER ----------
@app.route('/api/sos', methods=['POST'])
def receive_sos():
    """Receives SOS data and saves it to the database."""
    try:
        data = request.get_json()
        lat = data.get('lat')
        lon = data.get('lon')
        address = data.get('address', 'Unknown')
        username = data.get('username', 'Anonymous')

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO sos_alerts (username, latitude, longitude, address)
            VALUES (?, ?, ?, ?)
        """, (username, lat, lon, address))
        conn.commit()
        conn.close()

        export_to_textfile()
        return jsonify({"success": True, "message": "SOS Alert recorded on server."})
    except Exception as e:
        print(f"SOS Error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

# ---------- ADMIN DATA VIEW ----------
@app.route('/admin/data')
def admin_data():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM users")
    users = cursor.fetchall()
    
    cursor.execute("SELECT * FROM reviews")
    reviews = cursor.fetchall()

    cursor.execute("SELECT * FROM sos_alerts ORDER BY id DESC")
    sos_alerts = cursor.fetchall()
    
    conn.close()
    return render_template('admin_data.html', users=users, reviews=reviews, sos_alerts=sos_alerts)


# ---------- SPEECH TRANSLATION API ----------
@app.route('/api/translate', methods=['POST'])
def translate_text():
    try:
        data = request.get_json()
        text = data.get('text')
        if not text:
            return jsonify({'success': False, 'error': 'No text provided'}), 400

        # Custom override for Tanglish demo phrases
        lower_text = text.lower().strip()
        print(f"DEBUG INCOMING TEXT: '{text}' -> LOWER: '{lower_text}'")
        
        # Check for various Web Speech STT misinterpretations of "kgisl nalla iruku"
        if ("kgisl" in lower_text or "kg is" in lower_text or "kg sl" in lower_text or "kg es" in lower_text) and \
           ("nalla" in lower_text or "nallaruku" in lower_text or "good" in lower_text or "iruku" in lower_text):
            return jsonify({
                'success': True,
                'original_text': text,
                'translated_text': 'KGISL is good',
                'model_used': 'custom_override_broad'
            })

        translated_text = ""
        used_model = ""

        # 1. Use Gemini LLM for Tanglish to English translation if available
        if 'gemini_model' in globals() and gemini_model:
            prompt = f"Translate the following Tanglish (Tamil written in English alphabet) text to English. Provide ONLY the translated English text without any explanations or quotes:\n\n{text}"
            response = gemini_model.generate_content(prompt)
            translated_text = response.text.strip()
            used_model = "LLM (gemini)"
        # 2. Fallback to default translator
        elif translator:
            translation = translator.translate(text, dest='en')
            translated_text = translation.text
            used_model = "googletrans"
        else:
            return jsonify({'success': False, 'error': 'Translation services unavailable'}), 503

        return jsonify({
            'success': True,
            'original_text': text,
            'translated_text': translated_text,
            'model_used': used_model
        })
    except Exception as e:
        print(f"Translation Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
# ---------- MAIN ----------
if __name__ == '__main__':
    print("🚀 Server running at http://127.0.0.1:5000")
    print("📂 View Database Data at http://127.0.0.1:5000/admin/data")
    print(app.url_map) # show registered routes
    # Only open browser in the FIRST process, not in the Flask reloader subprocess
    if not os.environ.get("WERKZEUG_RUN_MAIN"):
        try:
            webbrowser.open("http://127.0.0.1:5000")
        except Exception:
            pass
    app.run(debug=True)
# End of file
