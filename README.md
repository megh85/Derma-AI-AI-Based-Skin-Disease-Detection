# DermaScan AI

An AI-powered skin disease detection system that analyzes skin images using **Deep Learning (CNN)** and provides predictions with confidence scores. The application assists in early screening by identifying possible skin conditions from uploaded images and generating a detailed analysis report.

## Features

- Upload and analyze skin images
- Image preprocessing using OpenCV
- CNN-based skin disease classification
- Displays predicted disease with confidence percentage
- Generates a detailed AI analysis report
- Provides condition description, possible symptoms, recommendations, and urgency level
- User-friendly web interface

## Tech Stack

- **Language:** Python
- **Framework:** TensorFlow, Keras
- **Computer Vision:** OpenCV
- **Deep Learning:** Convolutional Neural Network (CNN)
- **Data Processing:** NumPy
- **Visualization:** Matplotlib
- **Development:** Jupyter Notebook

## Workflow

1. Upload a skin image.
2. The image is preprocessed using OpenCV.
3. The CNN model extracts features and classifies the skin condition.
4. The system predicts the most likely disease.
5. A confidence score is generated.
6. A detailed analysis report is displayed with:
   - Detected condition
   - Confidence percentage
   - Urgency level
   - Disease description
   - Possible symptoms
   - Recommendations
   - Medical disclaimer

