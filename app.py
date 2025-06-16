from flask import Flask, jsonify, request, render_template, session, redirect, url_for
import psycopg2
import re
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps

app = Flask(__name__)
app.secret_key = 'your-secret-key-here'  # Change this to a secure secret key in production

DB_CONFIG = {
    "host": "localhost",
    "database": "Tourfirm",
    "user": "postgres",
    "password": "123",
    "port": 5432
}

# Login required decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# Role required decorator
def role_required(allowed_roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'role' not in session:
                return redirect(url_for('login'))
            if session['role'] not in allowed_roles:
                return jsonify({"error": "Недостаточно прав"}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        return render_template('login.html')
    
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({"error": "Необходимо указать имя пользователя и пароль"}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Try to find user in administrator table
    cursor.execute("SELECT id_administrator, username, password_hash, role FROM administrator WHERE username = %s", (username,))
    user = cursor.fetchone()
    
    if not user:
        # If not found in administrator, try tourist table
        cursor.execute("SELECT id_tourist, username, password_hash, role FROM tourist WHERE username = %s", (username,))
        user = cursor.fetchone()
    
    cursor.close()
    conn.close()
    
    if user and check_password_hash(user[2], password):
        session['user_id'] = user[0]
        session['username'] = user[1]
        session['role'] = user[3]
        return jsonify({"success": True, "role": user[3]})
    
    return jsonify({"error": "Неверное имя пользователя или пароль"}), 401

def is_valid_fio(fio):
    return bool(re.match(r'^([А-ЯЁ][а-яё]+ ){2}[А-ЯЁ][а-яё]+$', fio or ''))
def is_valid_phone(phone):
    return bool(re.match(r'^\+7\d{10}$', phone or ''))
def is_valid_passport(passport):
    return bool(re.match(r'^\d{4} \d{6}$', passport or ''))
def is_valid_email(email):
    return bool(re.match(r'^\S+@\S+\.\S+$', email or ''))

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'GET':
        return render_template('register.html')
    try:
        data = request.json
        if not data:
            print("No JSON data received")
            return jsonify({"error": "Данные не получены"}), 400
        username = data.get('username')
        password = data.get('password')
        role = data.get('role', 'tourist')
        tourist_snp = data.get('tourist_snp')
        tourist_birthday = data.get('tourist_birthday')
        tourist_phone = data.get('tourist_phone')
        tourist_email = data.get('tourist_email')
        tourist_passport = data.get('tourist_passport')
        administrator_snp = data.get('administrator_snp')
        administrator_phone = data.get('administrator_phone')
        administrator_email = data.get('administrator_email')
        administrator_passport = data.get('administrator_passport')
        print(f"Received registration data: username={username}, role={role}")
        if not username or not password:
            return jsonify({"error": "Необходимо указать имя пользователя и пароль"}), 400
        if role not in ['tourist', 'admin']:
            return jsonify({"error": "Недопустимая роль"}), 400
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT username FROM administrator WHERE username = %s
            UNION
            SELECT username FROM tourist WHERE username = %s
        """, (username, username))
        existing_user = cursor.fetchone()
        if existing_user:
            cursor.close()
            conn.close()
            return jsonify({"error": "Пользователь с таким именем уже существует"}), 400
        password_hash = generate_password_hash(password)
        try:
            if role == 'admin':
                if not all([administrator_snp, administrator_phone, administrator_email, administrator_passport]):
                    return jsonify({"error": "Пожалуйста, заполните все поля администратора"}), 400
                if not is_valid_fio(administrator_snp):
                    return jsonify({"error": "ФИО должно быть в формате: Фамилия Имя Отчество (кириллица)"}), 400
                if not is_valid_phone(administrator_phone):
                    return jsonify({"error": "Телефон должен быть в формате +7XXXXXXXXXX"}), 400
                if not is_valid_passport(administrator_passport):
                    return jsonify({"error": "Паспорт должен быть в формате 1234 567890"}), 400
                if not is_valid_email(administrator_email):
                    return jsonify({"error": "Некорректный email"}), 400
                cursor.execute("""
                    INSERT INTO administrator (username, password_hash, role, administrator_snp, administrator_passport, administrator_email, administrator_phone)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id_administrator
                """, (username, password_hash, role, administrator_snp, administrator_passport, administrator_email, administrator_phone))
                user_id = cursor.fetchone()[0]
            else:
                if not all([tourist_snp, tourist_birthday, tourist_phone, tourist_passport]):
                    return jsonify({"error": "Пожалуйста, заполните все поля для туриста"}), 400
                if not is_valid_fio(tourist_snp):
                    return jsonify({"error": "ФИО должно быть в формате: Фамилия Имя Отчество (кириллица)"}), 400
                if not is_valid_phone(tourist_phone):
                    return jsonify({"error": "Телефон должен быть в формате +7XXXXXXXXXX"}), 400
                if not is_valid_passport(tourist_passport):
                    return jsonify({"error": "Паспорт должен быть в формате 1234 567890"}), 400
                if tourist_email and not is_valid_email(tourist_email):
                    return jsonify({"error": "Некорректный email"}), 400
                if tourist_birthday:
                    try:
                        birth = datetime.strptime(tourist_birthday, '%Y-%m-%d')
                        now = datetime.now()
                        age = now.year - birth.year - ((now.month, now.day) < (birth.month, birth.day))
                        if age < 18:
                            return jsonify({"error": "Турист должен быть старше 18 лет"}), 400
                    except Exception:
                        return jsonify({"error": "Некорректная дата рождения"}), 400
                cursor.execute("""
                    INSERT INTO tourist (username, password_hash, role, tourist_snp, tourist_birthday, tourist_phone, tourist_email, tourist_passport, registration_date)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, CURRENT_DATE)
                    RETURNING id_tourist
                """, (username, password_hash, role, tourist_snp, tourist_birthday, tourist_phone, tourist_email, tourist_passport))
                user_id = cursor.fetchone()[0]
            conn.commit()
            session['user_id'] = user_id
            session['username'] = username
            session['role'] = role
            print(f"Successfully registered user: {username} with role {role}")
            return jsonify({"success": True, "role": role})
        except Exception as e:
            conn.rollback()
            print(f"Database error during registration: {str(e)}")
            return jsonify({"error": f"Ошибка при регистрации: {str(e)}"}), 500
    except Exception as e:
        print(f"General error during registration: {str(e)}")
        return jsonify({"error": f"Ошибка сервера: {str(e)}"}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

def format_date(date):
    
    if isinstance(date, datetime):
        return date.strftime("%d.%m.%Y")  
    return date

def get_db_connection():
    conn = psycopg2.connect(**DB_CONFIG)
    return conn

@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route("/tables", methods=["GET"])
def get_tables():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema='public'
            ORDER BY table_name;
            """
        )
        tables = [row[0] for row in cursor.fetchall()]
        cursor.close()
        conn.close()

        return jsonify({"tables": tables})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/update", methods=["POST"])
@login_required
@role_required(['admin'])
def update_cell():
    try:
        data = request.json
        table = data.get("table")  
        row_id = data.get("id")    
        column = data.get("column")  
        value = data.get("value")  

        if not all([table, row_id, column]):
            return jsonify({"success": False, "error": "Missing data"}), 400

        # Only admins can update data
        if session['role'] != 'admin':
            return jsonify({"success": False, "error": "Недостаточно прав"}), 403

        conn = get_db_connection()
        cursor = conn.cursor()

        if value is None:
            cursor.execute(f'UPDATE {table} SET "{column}" = NULL WHERE id_{table} = %s;', (row_id,))
        else:
            cursor.execute(f'UPDATE {table} SET "{column}" = %s WHERE id_{table} = %s;', (value, row_id))

        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({"success": True})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

COLUMN_MAPPING = {
    "administrator_snp": "ФИО администратора",
    "administrator_passport": "Паспортные данные",
    "administrator_email": "Почта администратора",
    "administrator_phone": "Номер телефона администратора",
    "departure_date": "Дата отправления",
    "administrator_passport": "Паспортные данные администратора",
    "discount_name": "Скидка",
    "discount_amount": "Размер скидки",
    "journey_name": "Путёвка",
    "journey_country": "Страна",
    "journey_duration": "Продолжительность (дней)",
    "journey_price": "Цена (₽)",
    "tourist_snp": "ФИО туриста",
    "tourist_birthday": "Дата рождения туриста",
    "tourist_phone": "Номер телефона туриста",
    "tourist_email": "Почта туриста",
    "tourist_passport": "Паспортные данные туриста",
    "registration_date": "Дата регистрации",
    "booking_date": "Дата бронирования",
    "booking_status": "Статус бронирования",
    "confirmation_date": "Дата подтверждения",
    "trip_date": "Дата поездки",
    "final_price": "Итоговая цена (₽)"
}

def transliterate(text):
    mapping = {
        "а": "a", "б": "b", "в": "v", "г": "g", "д": "d",
        "е": "e", "ё": "e", "ж": "zh", "з": "z", "и": "i",
        "й": "y", "к": "k", "л": "l", "м": "m", "н": "n",
        "о": "o", "п": "p", "р": "r", "с": "s", "т": "t",
        "у": "u", "ф": "f", "х": "kh", "ц": "ts", "ч": "ch",
        "ш": "sh", "щ": "shch", "ы": "y", "э": "e", "ю": "yu",
        "я": "ya", "ь": "", "ъ": "",
        "А": "A", "Б": "B", "В": "V", "Г": "G", "Д": "D",
        "Е": "E", "Ё": "E", "Ж": "Zh", "З": "Z", "И": "I",
        "Й": "Y", "К": "K", "Л": "L", "М": "M", "Н": "N",
        "О": "O", "П": "P", "Р": "R", "С": "S", "Т": "T",
        "У": "U", "Ф": "F", "Х": "Kh", "Ц": "Ts", "Ч": "Ch",
        "Ш": "Sh", "Щ": "Shch", "Ы": "Y", "Э": "E", "Ю": "Yu",
        "Я": "Ya", "Ь": "", "Ъ": ""
    }
    return ''.join(mapping.get(char, char) for char in text)

@app.route("/generate_report", methods=["POST"])
@login_required
def generate_report():
    # Только владелец (username == '0') может генерировать отчёт
    if session.get('role') != 'admin' or session.get('username') != '0':
        return jsonify({"success": False, "error": "Доступ запрещён"}), 403
    try:
        data = request.json
        start_date = data.get("start_date")
        end_date = data.get("end_date")
        if not start_date or not end_date:
            return jsonify({"success": False, "error": "Missing start or end date"}), 400
        start_date = datetime.strptime(start_date, "%d.%m.%Y").date()
        end_date = datetime.strptime(end_date, "%d.%m.%Y").date()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT COUNT(*), COALESCE(SUM(final_price), 0)
            FROM trip
            WHERE booking_status = 2 AND confirmation_date BETWEEN %s AND %s;
        """, (start_date, end_date))
        result = cursor.fetchone()
        cursor.close()
        conn.close()
        count = result[0] if result else 0
        total_price = result[1] if result else 0
        return jsonify({
            "success": True,
            "count": count,
            "total_price": total_price
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/table/<table_name>", methods=["GET"])
@login_required
@role_required(['admin', 'tourist'])
def get_table_data(table_name):
    try:
        sort_column = request.args.get('sort_column')
        sort_direction = request.args.get('sort_direction', 'asc')

        conn = get_db_connection()
        cursor = conn.cursor()

        if sort_direction not in ['asc', 'desc']:
            sort_direction = 'asc'

        order_by_clause = f"ORDER BY {sort_column} {sort_direction}" if sort_column else ""

        # Restrict access based on role
        if session['role'] == 'tourist':
            if table_name not in ['journey', 'trip']:
                return jsonify({"error": "Доступ запрещен"}), 403
            
            # For tourists, only show their own trips
            if table_name == 'trip':
                query = f"""
                    SELECT 
                        tr.id_trip, d.discount_name, j.journey_name, a.administrator_snp, t.tourist_snp,
                        tr.booking_date, tr.booking_status, tr.confirmation_date, tr.trip_date, tr.final_price
                    FROM trip tr
                    LEFT JOIN discount d ON tr.id_discount = d.id_discount
                    LEFT JOIN journey j ON tr.id_journey = j.id_journey
                    LEFT JOIN administrator a ON tr.id_administrator = a.id_administrator
                    LEFT JOIN tourist t ON tr.id_tourist = t.id_tourist
                    WHERE tr.id_tourist = %s
                    {order_by_clause}
                """
                cursor.execute(query, (session['user_id'],))
            elif table_name == 'journey':
                query = f"""
                    SELECT 
                        j.id_journey, a.administrator_snp, j.journey_name, j.journey_country,
                        j.journey_duration, j.journey_price
                    FROM journey j
                    LEFT JOIN administrator a ON j.id_administrator = a.id_administrator
                    {order_by_clause}
                """
                cursor.execute(query)
        else:
                # Admin can access all tables
            if table_name == "administrator":
                query = f"""
                    SELECT 
                                                                a.id_administrator, a.administrator_snp, a.administrator_passport,
                                                                a.administrator_email, a.administrator_phone
                    FROM administrator a
                    {order_by_clause}
                """
                cursor.execute(query)
            elif table_name == "departure":
                query = f"""
                    SELECT 
                        d.id_departure, j.journey_name, d.departure_date
                    FROM departure d
                    LEFT JOIN journey j ON d.id_journey = j.id_journey
                    {order_by_clause}
                """
                cursor.execute(query)
            elif table_name == "discount":
                query = f"""
                    SELECT 
                        d.id_discount, d.discount_name, d.discount_amount
                    FROM discount d
                    {order_by_clause}
                """
                cursor.execute(query)
            elif table_name == "journey":
                query = f"""
                    SELECT 
                                                                j.id_journey, a.administrator_snp, j.journey_name, j.journey_country,
                                                                j.journey_duration, j.journey_price
                    FROM journey j
                    LEFT JOIN administrator a ON j.id_administrator = a.id_administrator
                    {order_by_clause}
                """
                cursor.execute(query)
            elif table_name == "tourist":
                query = f"""
                    SELECT 
                                                                t.id_tourist, t.tourist_snp, d.discount_name, t.tourist_birthday,
                                                                t.tourist_phone, t.tourist_email, t.tourist_passport, t.registration_date
                    FROM tourist t
                    LEFT JOIN discount d ON t.id_discount = d.id_discount
                    {order_by_clause}
                """
                cursor.execute(query)
            elif table_name == "trip":
                query = f"""
                    SELECT 
                                                                tr.id_trip, d.discount_name, j.journey_name, a.administrator_snp,
                                                                t.tourist_snp, tr.booking_date, tr.booking_status, tr.confirmation_date,
                                                                tr.trip_date, tr.final_price
                    FROM trip tr
                    LEFT JOIN discount d ON tr.id_discount = d.id_discount
                    LEFT JOIN journey j ON tr.id_journey = j.id_journey
                    LEFT JOIN administrator a ON tr.id_administrator = a.id_administrator
                    LEFT JOIN tourist t ON tr.id_tourist = t.id_tourist
                    {order_by_clause}
                """
                cursor.execute(query)

        columns = [COLUMN_MAPPING.get(desc[0], desc[0]) for desc in cursor.description]
        rows = cursor.fetchall()
        formatted_rows = []
        for row in rows:
            formatted_row = [format_date(cell) if isinstance(cell, datetime) else cell for cell in row]
            formatted_rows.append(formatted_row)
        cursor.close()
        conn.close()

        return jsonify({"columns": columns, "rows": formatted_rows})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/call_book_trip", methods=["POST"])
@login_required
@role_required(['tourist'])
def call_book_trip():
    try:
        data = request.json
        journey_id = data.get("journey_id")

        if not journey_id:
            return jsonify({"success": False, "error": "Missing journey ID"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        # Use the logged-in tourist's ID
        tourist_id = session['user_id']

        print(f"Calling book_trip with tourist_id={tourist_id}, journey_id={journey_id}")  # Debug log
        cursor.execute("CALL book_trip(%s, %s);", (tourist_id, journey_id))
        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({"success": True})

    except Exception as e:
        print(f"Error in call_book_trip: {str(e)}")  # Debug log
        error_text = str(e)
        if 'нет доступных дат выезда' in error_text or 'нет доступных дат' in error_text:
            return jsonify({"success": False, "error": "Для выбранной путевки сейчас нет доступных дат выезда. Попробуйте выбрать другую путевку."}), 400
        return jsonify({"success": False, "error": error_text}), 500

@app.route("/add_journey", methods=["POST"])
@login_required
@role_required(['admin'])
def add_journey():
    try:
        data = request.json
        journey_name = data.get("journey_name")
        journey_country = data.get("journey_country")
        journey_duration = data.get("journey_duration")
        journey_price = data.get("journey_price")

        if not all([journey_name, journey_country, journey_duration, journey_price]):
            return jsonify({"success": False, "error": "Все поля должны быть заполнены"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        # Добавляем путевку и связываем её с текущим администратором
        cursor.execute("""
            INSERT INTO journey (journey_name, journey_country, journey_duration, journey_price, id_administrator)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id_journey
        """, (journey_name, journey_country, journey_duration, journey_price, session['user_id']))

        journey_id = cursor.fetchone()[0]
        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({"success": True, "journey_id": journey_id})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/get_user_role')
def get_user_role():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    return jsonify({'role': session.get('role', 'tourist')})

@app.route("/get_related_data/<table_name>", methods=["GET"])
@login_required
@role_required(['admin'])
def get_related_data(table_name):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        if table_name == "tourist":
            # Получаем список доступных скидок
            cursor.execute("SELECT id_discount, discount_name FROM discount ORDER BY discount_name")
            discounts = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
            return jsonify({"discounts": discounts})
        
        elif table_name == "trip":
            # Получаем списки для путевок, туристов, скидок
            cursor.execute("SELECT id_journey, journey_name FROM journey ORDER BY journey_name")
            journeys = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
            
            cursor.execute("SELECT id_tourist, tourist_snp FROM tourist ORDER BY tourist_snp")
            tourists = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
            
            cursor.execute("SELECT id_discount, discount_name FROM discount ORDER BY discount_name")
            discounts = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
            
            cursor.execute("SELECT id_administrator, administrator_snp FROM administrator ORDER BY administrator_snp")
            administrators = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
            
            return jsonify({
                "journeys": journeys,
                "tourists": tourists,
                "discounts": discounts,
                "administrators": administrators,
                "statuses": [
                    {"id": 1, "name": "Ожидает"},
                    {"id": 2, "name": "Подтверждено"},
                    {"id": 3, "name": "Отменено"}
                ]
            })
        
        elif table_name == "departure":
            # Получаем список путевок
            cursor.execute("SELECT id_journey, journey_name FROM journey ORDER BY journey_name")
            journeys = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
            return jsonify({"journeys": journeys})

        elif table_name == "journey":
            # Получаем список администраторов
            cursor.execute("SELECT id_administrator, administrator_snp FROM administrator ORDER BY administrator_snp")
            administrators = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
            return jsonify({"administrators": administrators})

        cursor.close()
        conn.close()
        return jsonify({"error": "Invalid table name"}), 400

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/get_row/<table_name>/<int:row_id>", methods=["GET"])
@login_required
@role_required(['admin'])
def get_row(table_name, row_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Получаем данные строки в зависимости от таблицы
        if table_name == "administrator":
            query = """
                SELECT administrator_snp, administrator_passport, administrator_email, administrator_phone
                FROM administrator WHERE id_administrator = %s
            """
        elif table_name == "departure":
            query = """
                SELECT d.id_journey, d.departure_date
                FROM departure d
                WHERE id_departure = %s
            """
        elif table_name == "discount":
            query = """
                SELECT discount_name, discount_amount
                FROM discount WHERE id_discount = %s
            """
        elif table_name == "journey":
            query = """
                SELECT journey_name, journey_country, journey_duration, journey_price
                FROM journey WHERE id_journey = %s
            """
        elif table_name == "tourist":
            query = """
                SELECT t.tourist_snp, t.tourist_birthday, t.tourist_phone, t.tourist_email,
                       t.tourist_passport, t.registration_date, t.id_discount
                FROM tourist t
                WHERE id_tourist = %s
            """
        elif table_name == "trip":
            query = """
                SELECT tr.id_journey, tr.id_tourist, tr.id_discount, tr.id_administrator,
                       tr.booking_date, tr.booking_status, tr.confirmation_date, tr.trip_date, tr.final_price
                FROM trip tr
                WHERE id_trip = %s
            """
        else:
            return jsonify({"error": "Invalid table name"}), 400

        cursor.execute(query, (row_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Row not found"}), 404

        # Получаем имена столбцов
        columns = [desc[0] for desc in cursor.description]
        formatted_row = {}
        
        for i, value in enumerate(row):
            column_name = columns[i]
            # Форматируем значение в зависимости от типа
            if isinstance(value, datetime):
                formatted_value = value.strftime("%d.%m.%Y")
            else:
                formatted_value = value
            formatted_row[column_name] = formatted_value

        # Получаем связанные данные
        related_data = {}
        if table_name == "tourist":
            cursor.execute("SELECT id_discount, discount_name FROM discount ORDER BY discount_name")
            related_data["discounts"] = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
        
        elif table_name == "trip":
            cursor.execute("SELECT id_journey, journey_name FROM journey ORDER BY journey_name")
            related_data["journeys"] = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
            
            cursor.execute("SELECT id_tourist, tourist_snp FROM tourist ORDER BY tourist_snp")
            related_data["tourists"] = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
            
            cursor.execute("SELECT id_discount, discount_name FROM discount ORDER BY discount_name")
            related_data["discounts"] = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
            
            cursor.execute("SELECT id_administrator, administrator_snp FROM administrator ORDER BY administrator_snp")
            related_data["administrators"] = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]
            
            related_data["statuses"] = [
                {"id": 1, "name": "Ожидает"},
                {"id": 2, "name": "Подтверждено"},
                {"id": 3, "name": "Отменено"}
            ]
        
        elif table_name == "departure":
            cursor.execute("SELECT id_journey, journey_name FROM journey ORDER BY journey_name")
            related_data["journeys"] = [{"id": row[0], "name": row[1]} for row in cursor.fetchall()]

        cursor.close()
        conn.close()

        return jsonify({
            "row": formatted_row,
            "related_data": related_data
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/update_row/<table_name>/<int:row_id>", methods=["POST"])
@login_required
@role_required(['admin'])
def update_row(table_name, row_id):
    try:
        data = request.json
        if not data:
            return jsonify({"success": False, "error": "No data provided"}), 400
        # Валидация для туриста
        if table_name == 'tourist':
            fio = data.get('tourist_snp')
            phone = data.get('tourist_phone')
            passport = data.get('tourist_passport')
            email = data.get('tourist_email')
            birthday = data.get('tourist_birthday')
            if fio is not None and fio != '' and not is_valid_fio(fio):
                return jsonify({"success": False, "error": "ФИО должно быть в формате: Фамилия Имя Отчество (кириллица)"}), 400
            if phone is not None and phone != '' and not is_valid_phone(phone):
                return jsonify({"success": False, "error": "Телефон должен быть в формате +7XXXXXXXXXX"}), 400
            if passport is not None and passport != '' and not is_valid_passport(passport):
                return jsonify({"success": False, "error": "Паспорт должен быть в формате 1234 567890"}), 400
            if email is not None and email != '' and not is_valid_email(email):
                return jsonify({"success": False, "error": "Некорректный email"}), 400
            if birthday is not None and birthday != '':
                try:
                    birth = datetime.strptime(birthday, '%Y-%m-%d') if '-' in birthday else datetime.strptime(birthday, '%d.%m.%Y')
                    now = datetime.now()
                    age = now.year - birth.year - ((now.month, now.day) < (birth.month, birth.day))
                    if age < 18:
                        return jsonify({"success": False, "error": "Турист должен быть старше 18 лет"}), 400
                except Exception:
                    return jsonify({"success": False, "error": "Некорректная дата рождения"}), 400
        # Валидация для администратора
        if table_name == 'administrator':
            fio = data.get('administrator_snp')
            phone = data.get('administrator_phone')
            passport = data.get('administrator_passport')
            email = data.get('administrator_email')
            if fio is not None and fio != '' and not is_valid_fio(fio):
                return jsonify({"success": False, "error": "ФИО должно быть в формате: Фамилия Имя Отчество (кириллица)"}), 400
            if phone is not None and phone != '' and not is_valid_phone(phone):
                return jsonify({"success": False, "error": "Телефон должен быть в формате +7XXXXXXXXXX"}), 400
            if passport is not None and passport != '' and not is_valid_passport(passport):
                return jsonify({"success": False, "error": "Паспорт должен быть в формате 1234 567890"}), 400
            if email is not None and email != '' and not is_valid_email(email):
                return jsonify({"success": False, "error": "Некорректный email"}), 400
        print(f"Updating {table_name} row {row_id} with data:", data)  # Debug log
        conn = get_db_connection()
        cursor = conn.cursor()
        update_fields = []
        values = []
        for key, value in data.items():
            if not key or key.isspace():
                continue
            if value is not None and value != '':
                if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', key):
                    continue
                update_fields.append(f"{key} = %s")
                if 'date' in key.lower() or 'birthday' in key.lower():
                    try:
                        date_parts = value.split('.')
                        if len(date_parts) == 3:
                            value = f"{date_parts[2]}-{date_parts[1]}-{date_parts[0]}"
                        values.append(value)
                    except (ValueError, IndexError) as e:
                        print(f"Date parsing error for {key}: {str(e)}")  # Debug log
                        return jsonify({"success": False, "error": f"Неверный формат даты для поля {key}"}), 400
                else:
                    values.append(value)
        if not update_fields:
            return jsonify({"success": False, "error": "Нет данных для обновления"}), 400
        values.append(row_id)
        query = f"""
            UPDATE {table_name}
            SET {', '.join(update_fields)}
            WHERE id_{table_name} = %s
        """
        print(f"Executing query: {query}")  # Debug log
        print(f"With values: {values}")     # Debug log
        try:
            cursor.execute(query, values)
            conn.commit()
            cursor.close()
            conn.close()
            return jsonify({"success": True})
        except psycopg2.Error as e:
            conn.rollback()
            print(f"Database error: {str(e)}")  # Debug log
            return jsonify({
                "success": False, 
                "error": f"Ошибка базы данных: {str(e)}"
            }), 500
    except Exception as e:
        print(f"General error in update_row: {str(e)}")  # Debug log
        import traceback
        traceback.print_exc()  # Печатаем полный стек ошибки
        return jsonify({
            "success": False, 
            "error": f"Ошибка сервера: {str(e)}"
        }), 500

@app.route("/update_cell/<table_name>/<int:row_id>", methods=["POST"])
@login_required
@role_required(['admin'])
def update_cell_endpoint(table_name, row_id):
    try:
        data = request.json
        column = data.get("column")
        value = data.get("value")
        is_display_value = data.get("display_value", False)

        if not column:
            return jsonify({"success": False, "error": "Необходимо указать название поля"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        # Определяем, является ли поле прямым или это связанное поле
        direct_fields = {
            'journey': ['journey_name', 'journey_country', 'journey_duration', 'journey_price'],
            'tourist': ['tourist_snp', 'tourist_birthday', 'tourist_phone', 'tourist_email', 'tourist_passport'],
            'administrator': ['administrator_snp', 'administrator_passport', 'administrator_email', 'administrator_phone'],
            'discount': ['discount_name', 'discount_amount'],
            'trip': ['booking_date', 'booking_status', 'confirmation_date', 'trip_date', 'final_price'],
            'departure': ['departure_date']  # Добавляем поля для таблицы departure
        }

        try:
            # Если это прямое поле текущей таблицы
            if table_name in direct_fields and column in direct_fields[table_name]:
                # Преобразуем значение если это дата
                if 'date' in column.lower() and value:
                    try:
                        value = datetime.strptime(value, "%Y-%m-%d")
                    except ValueError:
                        return jsonify({"success": False, "error": "Неверный формат даты"}), 400
                
                # Для числовых полей преобразуем строку в число
                if column in ['journey_duration', 'journey_price', 'discount_amount', 'final_price']:
                    try:
                        value = float(value) if 'price' in column else int(value)
                    except ValueError:
                        return jsonify({"success": False, "error": f"Неверный формат числа для поля {column}"}), 400

                query = f"""
                    UPDATE {table_name}
                    SET {column} = %s
                    WHERE id_{table_name} = %s
                """
                cursor.execute(query, (value, row_id))

            # Если это связанное поле
            elif is_display_value:
                if column in ['id_discount', 'id_journey', 'id_tourist', 'id_administrator']:
                    cursor.execute(f"UPDATE {table_name} SET {column} = %s WHERE id_{table_name} = %s", (value, row_id))
                elif column == 'booking_status':
                    status_mapping = {
                        "Ожидает": 1,
                        "Подтверждено": 2,
                        "Отменено": 3
                    }
                    # value может быть как id, так и строкой
                    try:
                        value_int = int(value)
                    except (ValueError, TypeError):
                        value_int = status_mapping.get(value)
                    if value_int is not None:
                        cursor.execute(f"UPDATE {table_name} SET booking_status = %s WHERE id_{table_name} = %s", (value_int, row_id))
            else:
                # Если поле не найдено в списках
                return jsonify({"success": False, "error": "Недопустимое поле для обновления"}), 400

            conn.commit()
            cursor.close()
            conn.close()

            return jsonify({"success": True})

        except psycopg2.Error as e:
            conn.rollback()
            print(f"Database error: {str(e)}")  # Логируем ошибку для отладки
            return jsonify({"success": False, "error": "Ошибка при обновлении данных"}), 500

    except Exception as e:
        print(f"General error: {str(e)}")  # Логируем ошибку для отладки
        return jsonify({"success": False, "error": "Произошла ошибка при обработке запроса"}), 500

@app.route("/add_departure", methods=["POST"])
@login_required
@role_required(['admin'])
def add_departure():
    if session.get('username') == '0':
        return jsonify({"success": False, "error": "Владелец не может добавлять даты отправления"}), 403
    try:
        data = request.json
        id_journey = data.get("id_journey")
        departure_date = data.get("departure_date")
        if not id_journey or not departure_date:
            return jsonify({"success": False, "error": "Все поля должны быть заполнены"}), 400
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO departure (id_journey, departure_date) VALUES (%s, %s)", (id_journey, departure_date))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/cancel_booking', methods=['POST'])
@login_required
@role_required(['tourist'])
def cancel_booking():
    try:
        data = request.json
        id_trip = data.get('id_trip')
        if not id_trip:
            return jsonify({'success': False, 'error': 'Не указан id поездки'}), 400
        conn = get_db_connection()
        cursor = conn.cursor()
        # Проверяем, что поездка принадлежит пользователю и статус "Ожидает"
        cursor.execute('SELECT booking_status FROM trip WHERE id_trip = %s AND id_tourist = %s', (id_trip, session['user_id']))
        row = cursor.fetchone()
        if not row:
            cursor.close()
            conn.close()
            return jsonify({'success': False, 'error': 'Поездка не найдена или не принадлежит вам'}), 403
        if row[0] != 1:
            cursor.close()
            conn.close()
            return jsonify({'success': False, 'error': 'Бронирование уже подтверждено или отменено'}), 400
        cursor.execute('UPDATE trip SET booking_status = 3 WHERE id_trip = %s', (id_trip,))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)
