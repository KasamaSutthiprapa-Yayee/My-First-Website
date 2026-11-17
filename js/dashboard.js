
import { supabase } from "./supabase.js";

const storeIcons = {
  "DAISO": "🏠",
  "OLIVE YOUNG": "🧴",
  "CU": "🥤",
  "GS25": "🍙",
  "MUSINSA": "👕",
  "EMART": "🛒",
  "NO BRAND": "🟡"
};

let activeWorkspaceId = null;

export async function loadDashboard() {
  const message = document.getElementById("dashboardMessage");
  const storeGrid = document.getElementById("storeGrid");
  const addProductSection =
    document.getElementById("addProductSection");

  message.textContent = "Loading shopping data...";

  try {
    // 1. Get workspace
    const { data: workspace, error: workspaceError } =
      await supabase
        .from("workspaces")
        .select("id, name, currency_rate")
        .eq("name", "Korea Shopping 2026")
        .limit(1)
        .maybeSingle();

    if (workspaceError) throw workspaceError;

    if (!workspace) {
      throw new Error("Workspace not found or access denied.");
    }

    const workspaceId = workspace.id;
    activeWorkspaceId = workspaceId;

    // 2. Fetch data
    const [storesResult, productsResult, purchasesResult] =
      await Promise.all([
        supabase
          .from("stores")
          .select("id, name, category")
          .eq("workspace_id", workspaceId)
          .order("name"),

        supabase
          .from("products")
.select(`
  id,
  store_id,
  name,
  image_url,
  price_krw,
  quantity,
  priority,
  notes
`)
.eq("workspace_id", workspaceId),

        supabase
          .from("purchases")
          .select("product_id, purchased_quantity")
          .eq("workspace_id", workspaceId)
      ]);

    if (storesResult.error) throw storesResult.error;
    if (productsResult.error) throw productsResult.error;
    if (purchasesResult.error) throw purchasesResult.error;

    const stores = storesResult.data || [];
    const products = productsResult.data || [];
    const purchases = purchasesResult.data || [];

    // 3. Calculate progress
    const totalProducts = products.length;

    const totalQuantity = products.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    const purchasedQuantity = purchases.reduce(
      (sum, item) => sum + item.purchased_quantity,
      0
    );

    const percentage = totalQuantity > 0
      ? Math.round(
          Math.min(purchasedQuantity / totalQuantity, 1) * 100
        )
      : 0;

    // 4. Update dashboard
    document.getElementById("workspaceName").textContent =
      workspace.name;

    document.getElementById("storeCount").textContent =
      stores.length;

    document.getElementById("productCount").textContent =
      totalProducts;

    document.getElementById("purchasedCount").textContent =
      purchasedQuantity;

    document.getElementById("progressPercent").textContent =
      percentage + "%";

    document.getElementById("progressBar").style.width =
      percentage + "%";

    document.getElementById("progressText").textContent =
      `${purchasedQuantity} of ${totalQuantity} items purchased`;

    // 5. Render expandable store cards
    storeGrid.replaceChildren();

    stores.forEach(store => {
      const storeProducts = products.filter(
        product => product.store_id === store.id
      );

      const storePurchased = storeProducts.reduce(
        (sum, product) => {
          const purchase = purchases.find(
            item => item.product_id === product.id
          );

          return sum + (purchase?.purchased_quantity || 0);
        },
        0
      );

      // Store wrapper
      const storeItem = document.createElement("div");
      storeItem.className = "store-item";

      // Store card
      const card = document.createElement("article");
      card.className = "store-card";
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-expanded", "false");

      const icon = document.createElement("div");
      icon.className = "store-icon";
      icon.textContent = storeIcons[store.name] || "🛍️";

      const title = document.createElement("h3");
      title.textContent = store.name;

      const category = document.createElement("p");
      category.textContent = store.category || "Shopping Store";

      const count = document.createElement("p");
      count.className = "store-count";
      count.textContent =
        `${storeProducts.length} products · ${storePurchased} bought`;

      const expandHint = document.createElement("p");
      expandHint.className = "store-expand-hint";
      expandHint.textContent =
        storeProducts.length > 0
          ? "Click to view products ↓"
          : "No products yet";

      card.append(icon, title, category, count, expandHint);

      // Product list panel
      const productPanel = document.createElement("div");
      productPanel.className = "store-product-panel hidden";

      // Toggle store products
      function toggleStore() {
        const isOpen = !productPanel.classList.contains("hidden");

        // Close other stores
        storeGrid.querySelectorAll(".store-product-panel").forEach(panel => {
          panel.classList.add("hidden");
        });

        storeGrid.querySelectorAll(".store-card").forEach(item => {
          item.setAttribute("aria-expanded", "false");
          item.classList.remove("active");
        });

        if (!isOpen) {
          productPanel.classList.remove("hidden");
          card.setAttribute("aria-expanded", "true");
          card.classList.add("active");
        }
      }

      card.addEventListener("click", toggleStore);

      card.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleStore();
        }
      });
     
      // Render products
      const panelTitle = document.createElement("h3");
      panelTitle.className = "store-product-title";
      panelTitle.textContent = `${store.name} Products`;

      productPanel.appendChild(panelTitle);

      if (storeProducts.length === 0) {
        const emptyMessage = document.createElement("p");
        emptyMessage.className = "empty-products";
        emptyMessage.textContent = "No products added to this store yet.";

        productPanel.appendChild(emptyMessage);

      } else {
        storeProducts.forEach(product => {
          const productCard = document.createElement("article");
          productCard.className = "product-card";

          // Product image
          if (product.image_url) {
            try {
              const imageUrl = new URL(product.image_url);

              if (
                imageUrl.protocol === "https:" ||
                imageUrl.protocol === "http:"
              ) {
                const image = document.createElement("img");
                image.className = "product-image";
                image.src = imageUrl.href;
                image.alt = product.name;
                image.loading = "lazy";

                // Hide broken images
                image.addEventListener("error", () => {
                  image.remove();
                });

                productCard.appendChild(image);
              }
            } catch {
              // Ignore invalid image URLs
            }
          }

          const details = document.createElement("div");
          details.className = "product-details";

          const productName = document.createElement("h4");
          productName.textContent = product.name;

          const price = document.createElement("p");
          price.className = "product-price";
          price.textContent =
            product.price_krw !== null
              ? `₩${Number(product.price_krw).toLocaleString("en-US")}`
              : "Price not specified";

          const quantity = document.createElement("p");
          quantity.className = "product-info";
          quantity.textContent = `Quantity: ${product.quantity}`;

          const priority = document.createElement("p");
          priority.className = "product-info";
          priority.textContent =
            `Priority: ${product.priority || "normal"}`;

          details.append(
            productName,
            price,
            quantity,
            priority
          );

          if (product.notes) {
            const notes = document.createElement("p");
            notes.className = "product-notes";
            notes.textContent = product.notes;
            details.appendChild(notes);
          }

          // Product action buttons
          const actions = document.createElement("div");
          actions.className = "product-actions";

          const editButton = document.createElement("button");
          editButton.type = "button";
          editButton.className = "product-edit-button";
          editButton.textContent = "Edit";

          const deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.className = "product-delete-button";
          deleteButton.textContent = "Delete";

          // Edit product - single form modal
          editButton.addEventListener("click", () => {
            const dialog = document.createElement("dialog");
            dialog.className = "edit-product-dialog";

            const form = document.createElement("form");
            form.className = "edit-product-form";

            const heading = document.createElement("h2");
            heading.textContent = "Edit Product";

            const subtitle = document.createElement("p");
            subtitle.textContent = "Update your product details";

            function createField(labelText, id, inputType, value, placeholder = "") {
              const wrapper = document.createElement("div");
              wrapper.className = "edit-form-field";

              const label = document.createElement("label");
              label.htmlFor = id;
              label.textContent = labelText;

              const input = document.createElement("input");
              input.id = id;
              input.name = id;
              input.type = inputType;
              input.value = value ?? "";
              input.placeholder = placeholder;

              wrapper.append(label, input);
              return { wrapper, input };
            }

            const nameField = createField(
              "Product Name",
              "editProductName",
              "text",
              product.name,
              "Enter product name"
            );
            nameField.input.required = true;

            const imageField = createField(
              "Image URL",
              "editProductImage",
              "url",
              product.image_url,
              "Paste image URL (optional)"
            );

            const priceField = createField(
              "Price (KRW)",
              "editProductPrice",
              "number",
              product.price_krw,
              "Enter price in KRW"
            );
            priceField.input.min = "0";
            priceField.input.step = "0.01";

            const quantityField = createField(
              "Quantity",
              "editProductQuantity",
              "number",
              product.quantity
            );
            quantityField.input.min = "1";
            quantityField.input.step = "1";
            quantityField.input.required = true;

            const priorityWrapper = document.createElement("div");
            priorityWrapper.className = "edit-form-field";

            const priorityLabel = document.createElement("label");
            priorityLabel.htmlFor = "editProductPriority";
            priorityLabel.textContent = "Priority";

            const prioritySelect = document.createElement("select");
            prioritySelect.id = "editProductPriority";
            prioritySelect.name = "editProductPriority";

            [
              ["must_buy", "Must Buy"],
              ["normal", "Normal"],
              ["optional", "Optional"]
            ].forEach(([value, text]) => {
              const option = document.createElement("option");
              option.value = value;
              option.textContent = text;
              prioritySelect.appendChild(option);
            });

            prioritySelect.value = product.priority || "normal";
            priorityWrapper.append(priorityLabel, prioritySelect);

            const notesWrapper = document.createElement("div");
            notesWrapper.className = "edit-form-field edit-full-width";

            const notesLabel = document.createElement("label");
            notesLabel.htmlFor = "editProductNotes";
            notesLabel.textContent = "Notes";

            const notesInput = document.createElement("textarea");
            notesInput.id = "editProductNotes";
            notesInput.name = "editProductNotes";
            notesInput.rows = 4;
            notesInput.placeholder = "Add product details or notes";
            notesInput.value = product.notes || "";

            notesWrapper.append(notesLabel, notesInput);

            const message = document.createElement("p");
            message.className = "edit-form-message";

            const actions = document.createElement("div");
            actions.className = "edit-form-actions";

            const cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.className = "edit-cancel-button";
            cancelButton.textContent = "Cancel";

            const saveButton = document.createElement("button");
            saveButton.type = "submit";
            saveButton.className = "edit-save-button";
            saveButton.textContent = "Save Changes";

            actions.append(cancelButton, saveButton);

            const grid = document.createElement("div");
            grid.className = "edit-form-grid";

            grid.append(
              nameField.wrapper,
              imageField.wrapper,
              priceField.wrapper,
              quantityField.wrapper,
              priorityWrapper,
              notesWrapper
            );

            form.append(
              heading,
              subtitle,
              grid,
              message,
              actions
            );

            dialog.appendChild(form);
            document.body.appendChild(dialog);

            cancelButton.addEventListener("click", () => {
              dialog.close();
            });

            dialog.addEventListener("close", () => {
              dialog.remove();
            });

            form.addEventListener("submit", async (event) => {
              event.preventDefault();

              const newName = nameField.input.value.trim();
              const newImage = imageField.input.value.trim();
              const priceText = priceField.input.value.trim();
              const quantityValue = Number(quantityField.input.value);
              const priorityValue = prioritySelect.value;
              const notesValue = notesInput.value.trim();

              const priceValue = priceText === ""
                ? null
                : Number(priceText);

              if (!newName) {
                message.textContent = "Product name is required.";
                return;
              }

              if (
                priceValue !== null &&
                (!Number.isFinite(priceValue) || priceValue < 0)
              ) {
                message.textContent = "Please enter a valid price.";
                return;
              }

              if (
                !Number.isInteger(quantityValue) ||
                quantityValue < 1
              ) {
                message.textContent =
                  "Quantity must be a whole number greater than 0.";
                return;
              }

              if (
                !["must_buy", "normal", "optional"].includes(priorityValue)
              ) {
                message.textContent = "Invalid priority.";
                return;
              }

              saveButton.disabled = true;
              saveButton.textContent = "Saving...";
              message.textContent = "";

              try {
                const { error } = await supabase
                  .from("products")
                  .update({
                    name: newName,
                    image_url: newImage || null,
                    price_krw: priceValue,
                    quantity: quantityValue,
                    priority: priorityValue,
                    notes: notesValue || null
                  })
                  .eq("id", product.id)
                  .eq("workspace_id", workspaceId);

                if (error) throw error;

                dialog.close();
                await loadDashboard();

              } catch (error) {
                console.error("Edit Product Error:", error);
                message.textContent =
                  "Unable to update product: " + error.message;

                saveButton.disabled = false;
                saveButton.textContent = "Save Changes";
              }
            });

            dialog.showModal();
          });

          // Delete product
          deleteButton.addEventListener("click", async () => {
            const confirmed = confirm(
              `Are you sure you want to delete "${product.name}"?`
            );

            if (!confirmed) return;

            deleteButton.disabled = true;
            deleteButton.textContent = "Deleting...";

            try {
              const { error } = await supabase
                .from("products")
                .delete()
                .eq("id", product.id)
                .eq("workspace_id", activeWorkspaceId);

              if (error) throw error;

              alert("Product deleted successfully!");

              await loadDashboard();

            } catch (error) {
              console.error("Delete Product Error:", error);
              alert("Unable to delete product: " + error.message);

            } finally {
              deleteButton.disabled = false;
              deleteButton.textContent = "Delete";
            }
          });

          actions.append(editButton, deleteButton);
          details.appendChild(actions);

          productCard.appendChild(details);
          productPanel.appendChild(productCard);
        });
      }

      storeItem.append(card, productPanel);
      storeGrid.appendChild(storeItem);
    });

    // 6. Setup Add Product form
    setupAddProductForm(stores);

    addProductSection.classList.remove("hidden");

    message.textContent = "Shopping data loaded successfully.";

  } catch (error) {
    console.error("Dashboard Error:", error);

    message.textContent =
      "Unable to load shopping data: " + error.message;
  }
}


// 7. Setup Add Product form
function setupAddProductForm(stores) {
  const form = document.getElementById("addProductForm");
  const storeSelect = document.getElementById("productStore");

  // Populate store options
  storeSelect.replaceChildren();

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Select a store";
  storeSelect.appendChild(defaultOption);

  stores.forEach(store => {
    const option = document.createElement("option");
    option.value = store.id;
    option.textContent = store.name;
    storeSelect.appendChild(option);
  });

  // Attach submit event only once
  if (form.dataset.listenerAttached === "true") return;

  form.dataset.listenerAttached = "true";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = document.getElementById("addProductButton");
    const formMessage =
      document.getElementById("addProductMessage");

    const productName =
      document.getElementById("productName").value.trim();

    const storeId = storeSelect.value;

    const imageUrl =
      document.getElementById("productImage").value.trim();

    const priceValue =
      document.getElementById("productPrice").value;

    const quantity = Number(
      document.getElementById("productQuantity").value
    );

    const priority =
      document.getElementById("productPriority").value;

    const notes =
      document.getElementById("productNotes").value.trim();

    if (!activeWorkspaceId) {
      formMessage.textContent = "Workspace is not available.";
      return;
    }

    if (!productName || !storeId || !Number.isInteger(quantity) || quantity < 1) {
      formMessage.textContent = "Please check the required fields.";
      return;
    }

    button.disabled = true;
    button.textContent = "Saving...";
    formMessage.textContent = "";

    try {
      const { error } = await supabase
        .from("products")
        .insert({
          workspace_id: activeWorkspaceId,
          store_id: storeId,
          name: productName,
          image_url: imageUrl || null,
          price_krw: priceValue === "" ? null : Number(priceValue),
          quantity: quantity,
          priority: priority,
          notes: notes || null
        });

      if (error) throw error;

      form.reset();
      document.getElementById("productQuantity").value = 1;

      formMessage.textContent = "Product added successfully!";

      await loadDashboard();

      formMessage.textContent = "Product added successfully!";

    } catch (error) {
      console.error("Add Product Error:", error);
      formMessage.textContent =
        "Unable to add product: " + error.message;

    } finally {
      button.disabled = false;
      button.textContent = "Add Product";
    }
  });
}
