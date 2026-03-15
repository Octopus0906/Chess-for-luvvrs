"""
Chess for Luvvrs — Run Script
Usage: python3 run.py
Then open: http://localhost:5000
"""
from app import app

if __name__ == '__main__':
    print("♥ Chess for Luvvrs — by Chris Dcruz")
    print("♥ Open your browser at: http://localhost:5000")
    app.run(debug=False, host='0.0.0.0', port=5000)
