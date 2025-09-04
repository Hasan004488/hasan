# utils/model_loader.py

import pickle
import os

# Path config
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODEL_DIR = os.path.join(BASE_DIR, "API")

# Load model, tokenizer, label encoder
def load_model_assets():
    model_path = os.path.join(MODEL_DIR, "ML_trained_model.pkl")  # Updated path
    vectorizer_path = os.path.join(MODEL_DIR, "tfidf_vectorizer.pkl")  # Updated path
    label_encoder_path = os.path.join(MODEL_DIR, "label_encoder.pkl")  # Updated path

    # Load the trained model
    with open(model_path, "rb") as f:
        model = pickle.load(f)

    # Load the TF-IDF vectorizer
    with open(vectorizer_path, "rb") as f:
        tfidf_vectorizer = pickle.load(f)

    # Load the label encoder
    with open(label_encoder_path, "rb") as f:
        label_encoder = pickle.load(f)

    return model, tfidf_vectorizer, label_encoder


# Predict function
def predict_attack_type(texts, model, tfidf_vectorizer, label_encoder):
    # Remove MAX_SEQ_LEN if not using sequence models (it's not needed here)
    # MAX_SEQ_LEN = 250  # Remove this line since it's not required for TF-IDF models

    # Transform texts using TF-IDF vectorizer
    features = tfidf_vectorizer.transform(texts)  # This will be a sparse matrix

    # Predict attack type using the model
    predictions = model.predict(features)  # This should return class indices (1D array)

    # Decode the prediction labels
    pred_labels = label_encoder.inverse_transform(predictions)  # No need for argmax

    results = []
    for label in pred_labels:
        results.append({
            "attack_type": label.lower(),
            "metadata": {}
        })

    return results
