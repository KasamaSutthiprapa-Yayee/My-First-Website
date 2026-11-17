
const imageInput = document.getElementById("productImageFile");

const previewContainer = document.getElementById(
  "productImagePreviewContainer"
);

const previewImage = document.getElementById(
  "productImagePreview"
);

const formMessage = document.getElementById("addProductMessage");

let previewObjectUrl = null;

function clearPreview() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }

  if (previewImage) {
    previewImage.removeAttribute("src");
  }

  if (previewContainer) {
    previewContainer.classList.add("hidden");
  }
}

// Stop safely if the upload field is not on this page
if (imageInput && previewContainer && previewImage) {

  imageInput.addEventListener("change", () => {
    const file = imageInput.files?.[0];

    clearPreview();

    if (formMessage) {
      formMessage.textContent = "";
    }

    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(file.type)) {
      if (formMessage) {
        formMessage.textContent =
          "Please select a JPG, PNG or WEBP image.";
      }

      imageInput.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      if (formMessage) {
        formMessage.textContent =
          "Image size must not exceed 5 MB.";
      }

      imageInput.value = "";
      return;
    }

    previewObjectUrl = URL.createObjectURL(file);

    previewImage.src = previewObjectUrl;
    previewContainer.classList.remove("hidden");
  });
}

export function resetProductImagePreview() {
  clearPreview();

  if (imageInput) {
    imageInput.value = "";
  }
}
