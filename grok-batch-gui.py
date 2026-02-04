import tkinter as tk
from tkinter import ttk, filedialog, scrolledtext, messagebox
import json
import subprocess
import threading
import os
from pathlib import Path

class BatchVideoGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Grok Batch Video Generator")
        self.root.geometry("900x700")
        self.root.configure(bg='#2b2b2b')
        
        # State
        self.process = None
        self.is_running = False
        self.is_paused = False
        
        # Create GUI
        self.create_widgets()
        
    def create_widgets(self):
        # Header
        header = tk.Frame(self.root, bg='#1e1e1e', height=80)
        header.pack(fill=tk.X, padx=10, pady=10)
        header.pack_propagate(False)
        
        title_label = tk.Label(
            header,
            text="🎬 Batch Video Generation",
            font=('Segoe UI', 20, 'bold'),
            fg='#ffffff',
            bg='#1e1e1e'
        )
        title_label.pack(pady=20)
        
        # Main container
        main_container = tk.Frame(self.root, bg='#2b2b2b')
        main_container.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))
        
        # Input Section
        input_frame = tk.LabelFrame(
            main_container,
            text=" 📁 Input Files ",
            font=('Segoe UI', 10, 'bold'),
            fg='#ffffff',
            bg='#363636',
            bd=2,
            relief=tk.GROOVE
        )
        input_frame.pack(fill=tk.X, pady=(0, 10))
        
        # Script File
        script_row = tk.Frame(input_frame, bg='#363636')
        script_row.pack(fill=tk.X, padx=10, pady=5)
        
        tk.Label(
            script_row,
            text="Kịch Bản:",
            font=('Segoe UI', 9),
            fg='#ffffff',
            bg='#363636',
            width=12,
            anchor='w'
        ).pack(side=tk.LEFT)
        
        self.script_path = tk.StringVar()
        script_entry = tk.Entry(
            script_row,
            textvariable=self.script_path,
            font=('Segoe UI', 9),
            bg='#2b2b2b',
            fg='#ffffff',
            insertbackground='#ffffff'
        )
        script_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        tk.Button(
            script_row,
            text="Chọn...",
            command=self.browse_script,
            bg='#0d7377',
            fg='#ffffff',
            font=('Segoe UI', 9),
            cursor='hand2',
            relief=tk.FLAT,
            padx=15
        ).pack(side=tk.LEFT)
        
        # Images Folder
        images_row = tk.Frame(input_frame, bg='#363636')
        images_row.pack(fill=tk.X, padx=10, pady=5)
        
        tk.Label(
            images_row,
            text="Folder Hình:",
            font=('Segoe UI', 9),
            fg='#ffffff',
            bg='#363636',
            width=12,
            anchor='w'
        ).pack(side=tk.LEFT)
        
        self.images_folder = tk.StringVar()
        images_entry = tk.Entry(
            images_row,
            textvariable=self.images_folder,
            font=('Segoe UI', 9),
            bg='#2b2b2b',
            fg='#ffffff',
            insertbackground='#ffffff'
        )
        images_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        tk.Button(
            images_row,
            text="Chọn...",
            command=self.browse_images,
            bg='#0d7377',
            fg='#ffffff',
            font=('Segoe UI', 9),
            cursor='hand2',
            relief=tk.FLAT,
            padx=15
        ).pack(side=tk.LEFT)
        
        # Output Folder
        output_row = tk.Frame(input_frame, bg='#363636')
        output_row.pack(fill=tk.X, padx=10, pady=5)
        
        tk.Label(
            output_row,
            text="Folder Output:",
            font=('Segoe UI', 9),
            fg='#ffffff',
            bg='#363636',
            width=12,
            anchor='w'
        ).pack(side=tk.LEFT)
        
        self.output_folder = tk.StringVar()
        output_entry = tk.Entry(
            output_row,
            textvariable=self.output_folder,
            font=('Segoe UI', 9),
            bg='#2b2b2b',
            fg='#ffffff',
            insertbackground='#ffffff'
        )
        output_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        tk.Button(
            output_row,
            text="Chọn...",
            command=self.browse_output,
            bg='#0d7377',
            fg='#ffffff',
            font=('Segoe UI', 9),
            cursor='hand2',
            relief=tk.FLAT,
            padx=15
        ).pack(side=tk.LEFT)
        
        # Settings Section
        settings_frame = tk.LabelFrame(
            main_container,
            text=" ⚙️ Configuration ",
            font=('Segoe UI', 10, 'bold'),
            fg='#ffffff',
            bg='#363636',
            bd=2,
            relief=tk.GROOVE
        )
        settings_frame.pack(fill=tk.X, pady=(0, 10))
        
        settings_grid = tk.Frame(settings_frame, bg='#363636')
        settings_grid.pack(fill=tk.X, padx=10, pady=5)
        
        # Duration
        tk.Label(
            settings_grid,
            text="Duration:",
            font=('Segoe UI', 9),
            fg='#ffffff',
            bg='#363636'
        ).grid(row=0, column=0, sticky='w', padx=5, pady=5)
        
        self.duration = tk.StringVar(value='6s')
        duration_combo = ttk.Combobox(
            settings_grid,
            textvariable=self.duration,
            values=['6s', '10s'],
            state='readonly',
            width=10
        )
        duration_combo.grid(row=0, column=1, padx=5, pady=5)
        
        # Resolution
        tk.Label(
            settings_grid,
            text="Resolution:",
            font=('Segoe UI', 9),
            fg='#ffffff',
            bg='#363636'
        ).grid(row=0, column=2, sticky='w', padx=5, pady=5)
        
        self.resolution = tk.StringVar(value='720p')
        resolution_combo = ttk.Combobox(
            settings_grid,
            textvariable=self.resolution,
            values=['480p', '720p'],
            state='readonly',
            width=10
        )
        resolution_combo.grid(row=0, column=3, padx=5, pady=5)
        
        # Skip Completed
        self.skipCompleted = tk.BooleanVar(value=True)
        skip_check = tk.Checkbutton(
            settings_grid,
            text="Bỏ qua scenes đã hoàn thành",
            variable=self.skipCompleted,
            font=('Segoe UI', 9),
            fg='#ffffff',
            bg='#363636',
            selectcolor='#2b2b2b',
            activebackground='#363636',
            activeforeground='#ffffff'
        )
        skip_check.grid(row=0, column=4, padx=20, pady=5)
        
        # Delay
        delay_row = tk.Frame(settings_frame, bg='#363636')
        delay_row.pack(fill=tk.X, padx=10, pady=5)
        
        tk.Label(
            delay_row,
            text="Delay giữa scenes:",
            font=('Segoe UI', 9),
            fg='#ffffff',
            bg='#363636'
        ).pack(side=tk.LEFT, padx=5)
        
        self.delay = tk.IntVar(value=30)
        delay_spinbox = tk.Spinbox(
            delay_row,
            from_=10,
            to=120,
            textvariable=self.delay,
            width=5,
            font=('Segoe UI', 9),
            bg='#2b2b2b',
            fg='#ffffff',
            buttonbackground='#0d7377',
            insertbackground='#ffffff'
        )
        delay_spinbox.pack(side=tk.LEFT, padx=5)
        
        tk.Label(
            delay_row,
            text="giây",
            font=('Segoe UI', 9),
            fg='#ffffff',
            bg='#363636'
        ).pack(side=tk.LEFT)
        
        # Progress Section
        progress_frame = tk.LabelFrame(
            main_container,
            text=" 📊 Progress ",
            font=('Segoe UI', 10, 'bold'),
            fg='#ffffff',
            bg='#363636',
            bd=2,
            relief=tk.GROOVE
        )
        progress_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 10))
        
        # Status Label
        self.status_label = tk.Label(
            progress_frame,
            text="Sẵn sàng",
            font=('Segoe UI', 10, 'bold'),
            fg='#4CAF50',
            bg='#363636',
            anchor='w'
        )
        self.status_label.pack(fill=tk.X, padx=10, pady=5)
        
        # Progress Bar
        self.progress_bar = ttk.Progressbar(
            progress_frame,
            mode='determinate',
            maximum=100
        )
        self.progress_bar.pack(fill=tk.X, padx=10, pady=5)
        
        # Stats
        stats_frame = tk.Frame(progress_frame, bg='#363636')
        stats_frame.pack(fill=tk.X, padx=10, pady=5)
        
        self.stat_total = tk.Label(
            stats_frame,
            text="Total: 0",
            font=('Segoe UI', 9),
            fg='#ffffff',
            bg='#363636'
        )
        self.stat_total.pack(side=tk.LEFT, padx=10)
        
        self.stat_completed = tk.Label(
            stats_frame,
            text="✅ Completed: 0",
            font=('Segoe UI', 9),
            fg='#4CAF50',
            bg='#363636'
        )
        self.stat_completed.pack(side=tk.LEFT, padx=10)
        
        self.stat_failed = tk.Label(
            stats_frame,
            text="❌ Failed: 0",
            font=('Segoe UI', 9),
            fg='#f44336',
            bg='#363636'
        )
        self.stat_failed.pack(side=tk.LEFT, padx=10)
        
        self.stat_pending = tk.Label(
            stats_frame,
            text="⏳ Pending: 0",
            font=('Segoe UI', 9),
            fg='#ff9800',
            bg='#363636'
        )
        self.stat_pending.pack(side=tk.LEFT, padx=10)
        
        # Log
        log_label = tk.Label(
            progress_frame,
            text="Log:",
            font=('Segoe UI', 9, 'bold'),
            fg='#ffffff',
            bg='#363636',
            anchor='w'
        )
        log_label.pack(fill=tk.X, padx=10, pady=(10, 5))
        
        self.log_text = scrolledtext.ScrolledText(
            progress_frame,
            font=('Consolas', 9),
            bg='#1e1e1e',
            fg='#00ff00',
            insertbackground='#ffffff',
            height=10
        )
        self.log_text.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        # Control Buttons
        btn_frame = tk.Frame(self.root, bg='#2b2b2b')
        btn_frame.pack(fill=tk.X, padx=10, pady=(0, 10))
        
        self.start_btn = tk.Button(
            btn_frame,
            text="▶️ Bắt Đầu Batch",
            command=self.start_batch,
            bg='#4CAF50',
            fg='#ffffff',
            font=('Segoe UI', 11, 'bold'),
            cursor='hand2',
            relief=tk.FLAT,
            padx=30,
            pady=10
        )
        self.start_btn.pack(side=tk.LEFT, padx=5)
        
        self.pause_btn = tk.Button(
            btn_frame,
            text="⏸️ Tạm Dừng",
            command=self.pause_batch,
            bg='#ff9800',
            fg='#ffffff',
            font=('Segoe UI', 11, 'bold'),
            cursor='hand2',
            relief=tk.FLAT,
            padx=30,
            pady=10,
            state=tk.DISABLED
        )
        self.pause_btn.pack(side=tk.LEFT, padx=5)
        
        self.stop_btn = tk.Button(
            btn_frame,
            text="⏹️ Dừng",
            command=self.stop_batch,
            bg='#f44336',
            fg='#ffffff',
            font=('Segoe UI', 11, 'bold'),
            cursor='hand2',
            relief=tk.FLAT,
            padx=30,
            pady=10,
            state=tk.DISABLED
        )
        self.stop_btn.pack(side=tk.LEFT, padx=5)
        
        tk.Button(
            btn_frame,
            text="📊 Xem Storyboard",
            command=self.view_storyboard,
            bg='#2196F3',
            fg='#ffffff',
            font=('Segoe UI', 11, 'bold'),
            cursor='hand2',
            relief=tk.FLAT,
            padx=30,
            pady=10
        ).pack(side=tk.RIGHT, padx=5)
    
    def browse_script(self):
        filename = filedialog.askopenfilename(
            title="Chọn file kịch bản",
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")]
        )
        if filename:
            self.script_path.set(filename)
    
    def browse_images(self):
        folder = filedialog.askdirectory(title="Chọn folder hình ảnh")
        if folder:
            self.images_folder.set(folder)
    
    def browse_output(self):
        folder = filedialog.askdirectory(title="Chọn folder output")
        if folder:
            self.output_folder.set(folder)
    
    def log(self, message):
        self.log_text.insert(tk.END, message + '\n')
        self.log_text.see(tk.END)
    
    def update_status(self, text, color='#4CAF50'):
        self.status_label.config(text=text, fg=color)
    
    def start_batch(self):
        # Validate inputs
        if not self.script_path.get():
            messagebox.showerror("Lỗi", "Vui lòng chọn file kịch bản!")
            return
        
        if not self.images_folder.get():
            messagebox.showerror("Lỗi", "Vui lòng chọn folder hình ảnh!")
            return
        
        if not self.output_folder.get():
            messagebox.showerror("Lỗi", "Vui lòng chọn folder output!")
            return
        
        # Build command
        cmd = [
            'node',
            'batch-process.js',
            self.script_path.get(),
            self.images_folder.get(),
            self.output_folder.get(),
            '--duration', self.duration.get(),
            '--resolution', self.resolution.get()
        ]
        
        if not self.skipCompleted.get():
            cmd.append('--include-completed')
        
        self.log(f"🚀 Khởi động batch processing...")
        self.log(f"📝 Script: {Path(self.script_path.get()).name}")
        self.log(f"🖼️  Images: {self.images_folder.get()}")
        self.log(f"📂 Output: {self.output_folder.get()}")
        self.log(f"⚙️  Config: {self.duration.get()}, {self.resolution.get()}")
        self.log("")
        
        # Disable controls
        self.start_btn.config(state=tk.DISABLED)
        self.pause_btn.config(state=tk.NORMAL)
        self.stop_btn.config(state=tk.NORMAL)
        
        self.is_running = True
        self.update_status("Đang chạy...", '#ff9800')
        
        # Run in thread
        thread = threading.Thread(target=self.run_batch, args=(cmd,))
        thread.daemon = True
        thread.start()
    
    def run_batch(self, cmd):
        # Working directory is current directory where this script is located
        cwd = os.path.dirname(os.path.abspath(__file__))
        
        self.process = subprocess.Popen(
            cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        for line in self.process.stdout:
            if not self.is_running:
                break
            self.root.after(0, self.log, line.rstrip())
        
        self.process.wait()
        
        if self.is_running:
            self.root.after(0, self.batch_completed)
    
    def batch_completed(self):
        self.is_running = False
        self.update_status("✅ Hoàn thành!", '#4CAF50')
        self.log("\n✅ Batch processing hoàn thành!")
        
        # Re-enable controls
        self.start_btn.config(state=tk.NORMAL)
        self.pause_btn.config(state=tk.DISABLED)
        self.stop_btn.config(state=tk.DISABLED)
        
        messagebox.showinfo("Hoàn thành", "Batch processing đã hoàn thành!\nClick 'Xem Storyboard' để xem kết quả.")
    
    def pause_batch(self):
        # TODO: Implement pause functionality
        if self.is_paused:
            self.is_paused = False
            self.pause_btn.config(text="⏸️ Tạm Dừng")
            self.log("▶️  Tiếp tục...")
        else:
            self.is_paused = True
            self.pause_btn.config(text="▶️ Tiếp Tục")
            self.log("⏸️  Tạm dừng...")
    
    def stop_batch(self):
        if self.process:
            self.process.terminate()
            self.is_running = False
            self.update_status("Đã dừng", '#f44336')
            self.log("\n🛑 Batch processing đã dừng!")
            
            self.start_btn.config(state=tk.NORMAL)
            self.pause_btn.config(state=tk.DISABLED)
            self.stop_btn.config(state=tk.DISABLED)
    
    def view_storyboard(self):
        if not self.output_folder.get():
            messagebox.showwarning("Cảnh báo", "Chưa chọn folder output!")
            return
        
        storyboard_path = os.path.join(self.output_folder.get(), 'storyboard.html')
        
        if os.path.exists(storyboard_path):
            import webbrowser
            webbrowser.open(f'file://{os.path.abspath(storyboard_path)}')
        else:
            messagebox.showwarning("Cảnh báo", "Chưa có storyboard! Hãy chạy batch trước.")

if __name__ == "__main__":
    root = tk.Tk()
    app = BatchVideoGUI(root)
    root.mainloop()
