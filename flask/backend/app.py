import os
import re
import pdfplumber
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
from pymongo import MongoClient
from werkzeug.utils import secure_filename

# ── App setup ──────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
TMPL_DIR   = os.path.join(BASE_DIR, '..', 'templates')
STATIC_DIR = os.path.join(BASE_DIR, '..', 'static')
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')

app = Flask(__name__, template_folder=TMPL_DIR, static_folder=STATIC_DIR)
CORS(app)

app.config['UPLOAD_FOLDER'] = UPLOAD_DIR
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024   # 16 MB
ALLOWED_EXTENSIONS = {'pdf'}

# ── MongoDB ────────────────────────────────────────────────────────────────────
try:
    client = MongoClient('mongodb://localhost:27017/', serverSelectionTimeoutMS=3000)
    client.server_info()
    db         = client['resume_screening']
    candidates = db['candidates']
    print("✅  Connected to MongoDB")
except Exception as e:
    print(f"⚠️  MongoDB unavailable – falling back to in-memory store ({e})")
    client     = None
    candidates = None

# In-memory fallback when MongoDB is not running
_memory_store: list[dict] = []

# ── Predefined skills ──────────────────────────────────────────────────────────
SKILL_SET = [
    'python', 'java', 'flask', 'mongodb', 'aws',
    'html', 'css', 'javascript', 'react', 'node',
    'sql', 'docker', 'kubernetes', 'git', 'linux',
    'django', 'fastapi', 'typescript', 'express', 'rest',
]

# ── Helpers ────────────────────────────────────────────────────────────────────
def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def extract_text(filepath: str) -> str:
    text = ''
    try:
        with pdfplumber.open(filepath) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text += t + '\n'
    except Exception as e:
        print(f"PDF extraction error: {e}")
    return text.strip()


def extract_name(text: str) -> str:
    """Best-effort: first non-empty line that looks like a proper name."""
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # Skip lines that look like headers / contact info
        if any(c in line for c in ['@', ':', '/', 'http', '+']):
            continue
        words = line.split()
        if 2 <= len(words) <= 4 and all(w[0].isupper() for w in words if w.isalpha()):
            return line
    return 'Unknown'


def extract_email(text: str) -> str:
    match = re.search(r'[\w.\-+]+@[\w\-]+\.[a-zA-Z]{2,}', text)
    return match.group(0) if match else ''


def extract_phone(text: str) -> str:
    match = re.search(
        r'(\+?\d{1,3}[\s\-]?)?(\(?\d{3}\)?[\s\-]?)(\d{3}[\s\-]?\d{4})', text
    )
    return match.group(0).strip() if match else ''


def extract_skills(text: str) -> list[str]:
    lower = text.lower()
    return [skill for skill in SKILL_SET if re.search(r'\b' + skill + r'\b', lower)]


def calculate_score(skills: list[str]) -> int:
    """Score 0-100 proportional to matched skills vs full skill list."""
    if not SKILL_SET:
        return 0
    raw = len(skills) / len(SKILL_SET) * 100
    return min(100, round(raw))


def db_insert(doc: dict) -> str:
    if candidates is not None:
        result = candidates.insert_one(doc)
        return str(result.inserted_id)
    else:
        import uuid
        doc['_id'] = str(uuid.uuid4())
        _memory_store.append(doc)
        return doc['_id']


def db_all() -> list[dict]:
    if candidates is not None:
        return list(candidates.find({}, {'_id': 0}).sort('score', -1))
    return sorted(_memory_store, key=lambda x: x.get('score', 0), reverse=True)


# ── Routes ─────────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')


@app.route('/upload', methods=['POST'])
def upload():
    if 'resume' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['resume']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'Only PDF files are allowed'}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    text   = extract_text(filepath)
    name   = extract_name(text)
    email  = extract_email(text)
    phone  = extract_phone(text)
    skills = extract_skills(text)
    score  = calculate_score(skills)

    doc = {
        'filename': filename,
        'name':     name,
        'email':    email,
        'phone':    phone,
        'skills':   skills,
        'score':    score,
        'text':     text[:5000],   # cap stored text
    }
    db_insert(doc)

    return jsonify({
        'message': 'Resume processed successfully',
        'name':    name,
        'email':   email,
        'phone':   phone,
        'skills':  skills,
        'score':   score,
    }), 200


@app.route('/candidates', methods=['GET'])
def get_candidates():
    docs = db_all()
    # Remove raw text from API response to keep payload light
    for d in docs:
        d.pop('text', None)
    return jsonify(docs), 200


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    print("🚀  Resume Screening Platform running on http://127.0.0.1:5000")
    app.run(debug=True, port=5000)
