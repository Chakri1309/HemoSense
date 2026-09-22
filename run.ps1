Set-Location $PSScriptRoot
pip install -r requirements.txt
python src/generate_data.py
python src/train.py
python app.py
