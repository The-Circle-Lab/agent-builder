import torch
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
import logging
from typing import Dict, Union
import os
import pathlib

logger = logging.getLogger(__name__)

class FrustrationAnalyzer:
    def __init__(self):
        self.model_path = pathlib.Path(__file__).parent.parent.parent / "frustration-detector"
        self.is_mock = False
        
        if torch.backends.mps.is_available():
            self.device = "mps"
        elif torch.cuda.is_available():
            self.device = "cuda"
        else:
            self.device = "cpu"
        
        self._load_model()

    def _load_model(self):
        try:
            # Check if the model directory exists
            if not os.path.exists(self.model_path):
                logger.warning(f"Model directory not found at: {self.model_path}")
                logger.info("Using mock frustration analyzer")
                self.is_mock = True
                return
                
            logger.info(f"Loading trained frustration detection model from: {self.model_path}")
            logger.info(f"Using device: {self.device}")
            
            # Load your trained model and tokenizer
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_path)
            self.model = AutoModelForSequenceClassification.from_pretrained(self.model_path)
            self.model.to(self.device)
            self.model.eval()
            
            # Create a pipeline for easier inference
            # Set device for pipeline: 0 for CUDA, "mps" for MPS, -1 for CPU
            pipeline_device = 0 if self.device == "cuda" else self.device if self.device == "mps" else -1
            self.classifier = pipeline(
                "text-classification",
                model=self.model,
                tokenizer=self.tokenizer,
                device=pipeline_device,
                return_all_scores=True
            )
            
            logger.info("Frustration detection model loaded successfully")
            
        except Exception as e:
            logger.error(f"Error loading frustration model: {e}")
            logger.info("Falling back to mock analyzer")
            self.is_mock = True
    
    def analyze_frustration(self, text: str) -> Dict[str, Union[str, float, bool]]:
        if self.is_mock:
            # Return mock results for development
            return {
                "text": text,
                "is_frustrated": False,
                "frustration_probability": 0.1,
                "not_frustrated_probability": 0.9,
                "confidence": 0.9,
                "prediction": "not_frustrated",
                "is_mock": True
            }
        
        try:
            results = self.classifier(text)[0]
            
            # results should have 2 classes: LABEL_0 (not frustrated) and LABEL_1 (frustrated)
            frustrated_score = None
            not_frustrated_score = None
            
            for result in results:
                if result['label'] == 'LABEL_1':  # Frustrated
                    frustrated_score = result['score']
                elif result['label'] == 'LABEL_0':  # Not frustrated
                    not_frustrated_score = result['score']
            
            # Determine if frustrated (threshold of 0.5)
            is_frustrated = frustrated_score > 0.5 if frustrated_score is not None else False
            
            return {
                "text": text,
                "is_frustrated": is_frustrated,
                "frustration_probability": frustrated_score,
                "not_frustrated_probability": not_frustrated_score,
                "confidence": max(frustrated_score or 0, not_frustrated_score or 0),
                "prediction": "frustrated" if is_frustrated else "not_frustrated",
                "is_mock": False
            }
            
        except Exception as e:
            logger.error(f"Error analyzing frustration: {e}")
            raise
    
    def get_frustration_score(self, text: str) -> float:
        try:
            result = self.analyze_frustration(text)
            return result["frustration_probability"] or 0.0
        except Exception as e:
            logger.error(f"Error getting frustration score: {e}")
            raise

    def is_frustrated(self, text: str, threshold: float = 0.5) -> bool:
        try:
            score = self.get_frustration_score(text)
            return score > threshold
        except Exception as e:
            logger.error(f"Error checking frustration: {e}")
            raise

if __name__ == "__main__":
    # Test the analyzer
    analyzer = FrustrationAnalyzer()
    
    # Test with some sample texts
    test_texts = [
        "I'm so happy with this code!",
        "This is so annoying, nothing works!",
        "The AI keeps giving me wrong answers, I'm frustrated",
        "Thank you for the help, that worked perfectly"
    ]
    
    for text in test_texts:
        result = analyzer.analyze_frustration(text)
        print(f"\nText: {text}")
        print(f"Frustrated: {result['is_frustrated']}")
        print(f"Frustration probability: {result['frustration_probability']:.3f}")
        print(f"Prediction: {result['prediction']}")

