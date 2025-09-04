# app.py
from flask import Flask, request, jsonify
from utils.preprocess import clean_text
from utils.model_loader import load_model_assets, predict_attack_type
from pymongo import MongoClient, UpdateOne
from collections import Counter
from datetime import date
import traceback

app = Flask(__name__)

# ============================
# MongoDB Configuration
# ============================
MONGO_URI = "mongodb://mongo_admin:E171x0b98e30609be1f@localhost"
DB_NAME = "eitix_dashboard"

# ============================
# Load model once
# ============================
print("[DEBUG] Loading model assets...")
model, tokenizer, label_encoder = load_model_assets()
print("[DEBUG] Model assets loaded.")

# ============================
# Utility Function: Fetch logs by log_ids
# ============================
def get_logs_from_mongo(log_ids):
    try:
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        today = date.today()
        col_date = today.strftime('%Y-%m-%d')
        COLLECTION_NAME = "wazuh.logs.data." + str(col_date)
        collection = db[COLLECTION_NAME]
        logs = list(collection.find({"id": {"$in": log_ids}}))

        for log in logs:
            rule = log.get("rule", {})
            log["rule_description"] = rule.get("description", "")
            log["Log_ID"] = str(log.get("id"))

        #print(f"[DEBUG] Retrieved {len(logs)} logs from MongoDB.")
        return logs
    except Exception as e:
        print("[ERROR] Failed to retrieve logs:", str(e))
        return []

# ============================
# Utility Function: Store prediction results
# ============================
def store_results(predictions):
    try:
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        today = date.today()
        col_date = today.strftime('%Y-%m-%d')
        COLLECTION_NAME = "wazuh.logs.data." + str(col_date)
        main_collection = db[COLLECTION_NAME]

        bulk_updates = []

        for pred in predictions:
            log_id = pred.get("Log_ID")
            if not log_id:
                continue

            update_data = {
                "attack_type": pred.get("predicted_attack_type", "Normal")
            }

            update_data["AI_Mapped_Metadata"] = pred.get("AI_Mapped_Metadata", {})

            bulk_updates.append(UpdateOne({"id": log_id}, {"$set": update_data}))

        if bulk_updates:
            main_collection.bulk_write(bulk_updates)

        #print(f"[DEBUG] Stored {len(predictions)} predictions to MongoDB.")

    except Exception as e:
        print("[ERROR] Failed to store results:", str(e))

# ============================
# API Routes
# ============================

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "alive"})

@app.route("/", methods=["GET"])
def root():
    return jsonify({"message": "Welcome to the Attack Detection API"})

@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json()
        log_ids = data.get("log_ids", [])

        """ print(f"[DEBUG] Received request for log_ids: {log_ids}") """

        if not log_ids:
            return jsonify({"error": "No log_ids provided"}), 400

        logs = get_logs_from_mongo(log_ids)

        if not logs:
            return jsonify({"error": "No logs found for provided IDs"}), 404

        rule_descriptions = [log.get("rule_description", "") for log in logs]
        full_logs = [log.get("full_log", "") for log in logs]
        texts = [f"{rd} {fl}" for rd, fl in zip(rule_descriptions, full_logs)]

        clean_texts = [clean_text(t) for t in texts]
        # print(f"[DEBUG] Cleaned texts ready for prediction: {clean_texts}")

        predictions_raw = predict_attack_type(clean_texts, model, tokenizer, label_encoder)
        # print(f"[DEBUG] Raw predictions: {predictions_raw}")

        predictions = []
        for log, pred in zip(logs, predictions_raw):
            attack_type = pred.get("attack_type", "Normal")
            result = {
                "Log_ID": log.get("Log_ID"),
                "predicted_attack_type": attack_type,
            }
            predictions.append(result)

        store_results(predictions)

        summary = dict(Counter([r['predicted_attack_type'] for r in predictions]))
        return jsonify({"summary": summary})

    except Exception as e:
        print("[ERROR] Exception during prediction:")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# ============================
# Run Flask App
# ============================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5304, debug=False)
