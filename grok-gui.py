import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox, filedialog
import subprocess
import threading
import os
import json
import time
from datetime import datetime

class GrokGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Grok Video Generator")
        self.root.geometry("700x650")
        self.root.resizable(True, True)
        
        # Variables
        self.process = None
        self.is_running = False
        
        # Styling
        style = ttk.Style()
        style.theme_use('clam')
        
        # Main container with padding
        main_frame = ttk.Frame(root, padding="15")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        root.columnconfigure(0, weight=1)
        root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(1, weight=1)
        
        # Title
        title_label = ttk.Label(main_frame, text="Grok Video Automation Tool", 
                               font=('Segoe UI', 16, 'bold'))
        title_label.grid(row=0, column=0, columnspan=3, pady=(0, 15))
        
        # Input Image (optional)
        image_frame = ttk.Frame(main_frame)
        image_frame.grid(row=1, column=0, columnspan=3, sticky=(tk.W, tk.E), pady=(0, 10))
        
        ttk.Label(image_frame, text="Input Image (optional):", font=('Segoe UI', 10, 'bold')).pack(side=tk.LEFT)
        self.image_path = ttk.Entry(image_frame)
        self.image_path.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        browse_btn = ttk.Button(image_frame, text="Browse...", command=self.browse_image, width=10)
        browse_btn.pack(side=tk.LEFT)

        # Prompt input
        ttk.Label(main_frame, text="Prompt:", font=('Segoe UI', 10, 'bold')).grid(
            row=2, column=0, sticky=tk.W, pady=5)
        self.prompt_text = scrolledtext.ScrolledText(main_frame, height=4, width=50, 
                                                     font=('Segoe UI', 10), wrap=tk.WORD)
        self.prompt_text.grid(row=3, column=0, columnspan=3, sticky=(tk.W, tk.E), pady=(0, 10))
        self.prompt_text.insert("1.0", "A cinematic shot of a sunset over mountains")
        
        # Parameters frame
        params_frame = ttk.LabelFrame(main_frame, text="Video Parameters", padding="10")
        params_frame.grid(row=4, column=0, columnspan=3, sticky=(tk.W, tk.E), pady=(0, 10))
        params_frame.columnconfigure(1, weight=1)
        
        # Aspect Ratio
        ttk.Label(params_frame, text="Aspect Ratio:").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.aspect_ratio = ttk.Combobox(params_frame, values=["16:9", "9:16", "1:1"], 
                                         state="readonly", width=15)
        self.aspect_ratio.set("16:9")
        self.aspect_ratio.grid(row=0, column=1, sticky=tk.W, padx=(10, 0), pady=5)
        
        # Duration
        ttk.Label(params_frame, text="Duration:").grid(row=1, column=0, sticky=tk.W, pady=5)
        self.duration = ttk.Combobox(params_frame, values=["6s", "10s"], 
                                     state="readonly", width=15)
        self.duration.set("6s")
        self.duration.grid(row=1, column=1, sticky=tk.W, padx=(10, 0), pady=5)
        
        # Resolution
        ttk.Label(params_frame, text="Resolution:").grid(row=2, column=0, sticky=tk.W, pady=5)
        self.resolution = ttk.Combobox(params_frame, values=["480p", "720p"], 
                                       state="readonly", width=15)
        self.resolution.set("720p")
        self.resolution.grid(row=2, column=1, sticky=tk.W, padx=(10, 0), pady=5)
        
        # CDN URL (optional)
        ttk.Label(params_frame, text="CDN URL (optional):").grid(row=3, column=0, sticky=tk.W, pady=5)
        self.cdn_url = ttk.Entry(params_frame, width=40)
        self.cdn_url.grid(row=3, column=1, sticky=(tk.W, tk.E), padx=(10, 0), pady=5)
        
        # Buttons frame
        buttons_frame = ttk.Frame(main_frame)
        buttons_frame.grid(row=5, column=0, columnspan=3, pady=10)
        
        # Generate button
        self.generate_btn = ttk.Button(buttons_frame, text="🚀 Generate Video", 
                                       command=self.start_automation, width=20)
        self.generate_btn.grid(row=0, column=0, padx=5)
        
        # Stop button
        self.stop_btn = ttk.Button(buttons_frame, text="⏹ Stop", 
                                   command=self.stop_automation, state=tk.DISABLED, width=15)
        self.stop_btn.grid(row=0, column=1, padx=5)
        
        # Open folder button
        self.folder_btn = ttk.Button(buttons_frame, text="📁 Open Downloads", 
                                     command=self.open_downloads_folder, width=20)
        self.folder_btn.grid(row=0, column=2, padx=5)
        
        # Log output
        ttk.Label(main_frame, text="Automation Log:", font=('Segoe UI', 10, 'bold')).grid(
            row=6, column=0, sticky=tk.W, pady=(5, 5))
        
        self.log_text = scrolledtext.ScrolledText(main_frame, height=15, width=50, 
                                                  font=('Consolas', 9), wrap=tk.WORD, 
                                                  state=tk.DISABLED, bg='#1e1e1e', fg='#d4d4d4')
        self.log_text.grid(row=7, column=0, columnspan=3, sticky=(tk.W, tk.E, tk.N, tk.S), pady=(0, 10))
        main_frame.rowconfigure(7, weight=1)
        
        # Status bar
        self.status_var = tk.StringVar(value="Ready")
        status_bar = ttk.Label(main_frame, textvariable=self.status_var, 
                               relief=tk.SUNKEN, anchor=tk.W, font=('Segoe UI', 9))
        status_bar.grid(row=8, column=0, columnspan=3, sticky=(tk.W, tk.E))
        
        self.log("Grok Video Automation Tool initialized ✓")
        self.log("Fill in the parameters and click 'Generate Video' to start")
    
    def browse_image(self):
        filename = filedialog.askopenfilename(
            title="Select Image",
            filetypes=[("Image files", "*.png;*.jpg;*.jpeg;*.webp"), ("All files", "*.*")]
        )
        if filename:
            self.image_path.delete(0, tk.END)
            self.image_path.insert(0, filename)
    
    def log(self, message):
        """Add message to log with timestamp"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.log_text.config(state=tk.NORMAL)
        self.log_text.insert(tk.END, f"[{timestamp}] {message}\n")
        self.log_text.see(tk.END)
        self.log_text.config(state=tk.DISABLED)

    def check_chrome_debugger_running(self):
        """Check if something is listening on port 9222"""
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(('127.0.0.1', 9222))
        sock.close()
        return result == 0

    def launch_chrome(self):
        """Attempt to launch Chrome with remote debugging"""
        chrome_paths = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            os.path.expanduser(r"~\AppData\Local\Google\Chrome\Application\chrome.exe")
        ]
        
        chrome_exe = None
        for path in chrome_paths:
            if os.path.exists(path):
                chrome_exe = path
                break
        
        if not chrome_exe:
            self.log("Could not find chrome.exe in standard locations")
            return False
            
        try:
            cmd = [
                chrome_exe,
                "--remote-debugging-port=9222",
                r"--user-data-dir=C:\chrome-debug-profile"
            ]
            subprocess.Popen(cmd)
            return True
        except Exception as e:
            self.log(f"Error launching Chrome: {e}")
            return False

    
    def start_automation(self):
        """Start the Playwright automation"""
        prompt = self.prompt_text.get("1.0", tk.END).strip()
        
        if not prompt:
            messagebox.showwarning("No Prompt", "Please enter a prompt for the video!")
            return
        
        # Create config object
        config = {
            "prompt": prompt,
            "imagePath": self.image_path.get().strip(),
            "aspectRatio": self.aspect_ratio.get(),
            "duration": self.duration.get(),
            "resolution": self.resolution.get()
        }
        
        cdn = self.cdn_url.get().strip()
        if cdn:
            config["cdnUrl"] = cdn
        
        # Auto-launch Chrome if needed
        if not self.check_chrome_debugger_running():
            self.log("Chrome debugger not detected. Launching Chrome...")
            if self.launch_chrome():
                self.log("✅ Chrome launched successfully")
                time.sleep(3) # Wait for Chrome to start
            else:
                self.log("❌ Failed to launch Chrome automatically. Please open it manually.")
                return

        # Save config to temporary file
        config_path = os.path.join(os.path.dirname(__file__), 'temp_config.json')
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        
        self.log("=" * 50)
        self.log(f"Starting automation with prompt: {prompt[:50]}...")
        self.log(f"Parameters: {self.aspect_ratio.get()} | {self.duration.get()} | {self.resolution.get()}")
        
        # Update UI
        self.is_running = True
        self.generate_btn.config(state=tk.DISABLED)
        self.stop_btn.config(state=tk.NORMAL)
        self.status_var.set("Running automation...")
        
        # Run in separate thread
        thread = threading.Thread(target=self.run_automation, args=(config_path,), daemon=True)
        thread.start()
    
    def run_automation(self, config_path):
        """Run the Node.js automation script"""
        try:
            cmd = ['node', 'grok-automation.js', config_path]
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,  # Combine stderr with stdout
                text=True,
                encoding='utf-8',
                bufsize=1,
                cwd=os.path.dirname(__file__)
            )
            
            # Read output in real-time
            for line in self.process.stdout:
                line = line.strip()
                if line:
                    self.root.after(0, self.log, line)
            
            # Wait for process to complete
            self.process.wait()
            
            # Check exit code
            if self.process.returncode == 0:
                self.root.after(0, self.log, "✓ Automation completed successfully!")
                self.root.after(0, self.status_var.set, "Completed successfully")
                self.root.after(0, messagebox.showinfo, "Success", 
                              "Video generated successfully! Check the downloads folder.")
            else:
                self.root.after(0, self.log, f"✗ Automation failed with code {self.process.returncode}")
                self.root.after(0, self.status_var.set, "Failed")
                self.root.after(0, messagebox.showerror, "Error", 
                              f"Automation failed. Check the log for details.")
            
        except FileNotFoundError:
            self.root.after(0, self.log, "✗ Error: Node.js not found. Please install Node.js")
            self.root.after(0, messagebox.showerror, "Error", 
                          "Node.js not found. Please install Node.js and try again.")
        except Exception as e:
            self.root.after(0, self.log, f"✗ Error: {str(e)}")
            self.root.after(0, messagebox.showerror, "Error", str(e))
        finally:
            self.root.after(0, self.reset_ui)
    
    def stop_automation(self):
        """Stop the running automation"""
        if self.process and self.process.poll() is None:
            self.process.terminate()
            self.log("⏹ Automation stopped by user")
            self.status_var.set("Stopped")
            self.reset_ui()
    
    def reset_ui(self):
        """Reset UI after automation completes"""
        self.is_running = False
        self.generate_btn.config(state=tk.NORMAL)
        self.stop_btn.config(state=tk.DISABLED)
        if self.status_var.get() == "Running automation...":
            self.status_var.set("Ready")
    
    def open_downloads_folder(self):
        """Open the downloads folder"""
        downloads_path = os.path.join(os.path.dirname(__file__), 'downloads')
        
        if not os.path.exists(downloads_path):
            os.makedirs(downloads_path)
            self.log(f"Created downloads folder: {downloads_path}")
        
        # Open folder in file explorer
        os.startfile(downloads_path)
        self.log("Opened downloads folder")

def main():
    root = tk.Tk()
    app = GrokGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()
