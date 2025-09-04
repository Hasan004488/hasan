function previewImage(input, img_selector) {

    const reader = new FileReader();
    
    reader.onload = function() {
        const dataURL = reader.result;
        const imgElement = document.querySelector(img_selector);
        imgElement.src = dataURL;
    };
    
    reader.readAsDataURL(input.files[0]);

  }