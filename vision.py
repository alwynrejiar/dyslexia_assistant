import cv2
import tkinter as tk
from tkinter import scrolledtext
from PIL import Image, ImageTk
import base64
import threading
from huggingface_hub import InferenceClient


HF_TOKEN = "hf_cNoHAUghqYWvjBHGixrTfNadUeqKycGs"

class DysgraphiaApp:
    def _init_(self, window):
        self.window = window
        self.window.title("Dysgraphia Live Scanner")
        self.window.geometry("1000x600")
        self.window.configure(bg="#f0f0f0")

       
        self.video_frame = tk.Frame(window, bg="black", width=640, height=480)
        self.video_frame.pack(side=tk.LEFT, padx=20, pady=20)
        
        self.video_label = tk.Label(self.video_frame)
        self.video_label.pack()

        
        self.ui_frame = tk.Frame(window, bg="#f0f0f0")
        self.ui_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=20, pady=20)

        self.btn_capture = tk.Button(self.ui_frame, text="Capture & Transcribe (Spacebar)", 
                                     font=("Arial", 14, "bold"), bg="#007aff", fg="white",
                                     command=self.start_transcription)
        self.btn_capture.pack(pady=10, fill=tk.X)

        self.text_output = scrolledtext.ScrolledText(self.iu_frame, wrap=tk.WORD, font=("Arial", 14))
        self.text_output.pack(fill=tk.BOTH, expand=True)
        self.text_output.insert(tk.END, "Camera is live.")
       
        self.cap = cv2.VideoCapture(0) 
        
        
        self.window.bind('<space>', lambda event: self.start_transcription())

        
        self.update_video_feed()

    def update_video_feed(self):
        """Continuously pulls frames from the webcam and displays them."""
        ret, frame = self.cap.read()
        if ret:
            
            cv_img = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            
            img = Image.fromarray(cv_img)
            imgtk = ImageTk.PhotoImage(image=img)
            
            self.video_label.imgtk = imgtk
            self.video_label.configure(image=imgtk)
            
        
        self.window.after(15, self.update_video_feed)

    def start_transcription(self):
        """Grabs the current frame and starts the API call in the background."""
        ret, frame = self.cap.read()
        if not ret:
            return

        
        self.btn_capture.config(text="Processing... Please Wait", state=tk.DISABLED)
        self.text_output.delete(1.0, tk.END)
        self.text_output.insert(tk.END, "Analyzing handwriting...\n\nSending to AI...")

        
        _, buffer = cv2.imencode('.jpg', frame)
        base64_image = base64.b64encode(buffer).decode('utf-8')

        
        threading.Thread(target=self.call_huggingface_api, args=(base64_image,), daemon=True).start()

    def call_huggingface_api(self, base64_image):
        """Sends the image to the AI and retrieves the text."""
        client = InferenceClient(api_key=HF_TOKEN)
        image_url = f"data:image/jpeg;base64,{base64_image}"
        
        prompt_text = (
            "You are an expert at reading and transcribing dysgraphic handwriting. "
            "Please transcribe the handwritten text in this image as accurately as possible. "
            "Crucially, preserve the exact spelling, grammar, spacing, and punctuation as written, "
            "even if it is incorrect. Do not autocorrect or fix mistakes, as analyzing these "
            "errors is necessary for diagnosing the writer's dysgraphia."
        )

        messages = [
            {"role": "user", "content": [
                {"type": "text", "text": prompt_text},
                {"type": "image_url", "image_url": {"url": image_url}}
            ]}
        ]

        try:
            response = client.chat.completions.create(
                model="Qwen/Qwen2-VL-7B-Instruct",
                messages=messages,
                max_tokens=512,
                temperature=0.1 
            )
            result_text = response.choices[0].message.content
        except Exception as e:
            result_text = f"API Error: {e}"

        
        self.window.after(0, self.display_result, result_text)

    def display_result(self, text):
        """Shows the final text and resets the button."""
        self.text_output.delete(1.0, tk.END)
        self.text_output.insert(tk.END, text)
        self.btn_capture.config(text="Capture & Transcribe (Spacebar)", state=tk.NORMAL)

    def on_closing(self):
        """Releases the Mac camera properly when you close the window."""
        self.cap.release()
        self.window.destroy()

if _name_ == "_main_":
    root = tk.Tk()
    app = DysgraphiaApp(root)
    root.protocol("WM_DELETE_WINDOW", app.on_closing)
    
    
    root.call('wm', 'attributes', '.', '-topmost', True)
    root.after(1000, lambda: root.call('wm', 'attributes', '.', '-topmost', False))
    
    root.mainloop()