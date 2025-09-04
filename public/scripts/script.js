/* 
Attention!
These scripts appear at the bottom of the layout affecting any places in a page
*/

function pad(num, size) {

  var s = "000000000" + num;
  return s.slice(s.length - size);

}

function htmlToday(days = 0) {
  // returns date in a format that supported by html
  let today = new Date();
  today.setDate(today.getDate() + days);
  return `${pad(today.getFullYear(), 4)}-${pad(today.getMonth() + 1, 2)}-${pad(today.getDate(), 2)}`;
}

function toggleSidebar() {

  $("#sidebar-con").toggleClass("d-none");
  $("#dashboard-body").toggleClass("blur");

}

function togglePopup(title, body_html, show = true) {

  $("#popup").toggleClass("d-none");
  $("#popup .title").html(title);
  $("#popup .body").html(body_html);

  $("#dashboard-body").toggleClass("blur");
  $("#sidebar").toggleClass("blur");

}

function toggleSecondaryPopup(title, body_html, url, type = "GET", container = "#popup2 .body") {

  $("#popup2").toggleClass("d-none");
  $("#popup2 .title").html(title);
  $("#popup2 .body").html(body_html || "");

  $("#dashboard-body").toggleClass("secondary-blur");
  $("#sidebar").toggleClass("secondary-blur");

  if (url) {
    fetchDynamicData({
      container, url, type
    }, (response) => {

      $("#popup2 .body").html(response);

    })
  }

}

// toggle multiple elements at the same time by d-none
function toggle(...selectors) {
  selectors.forEach((selector) => {
    document.querySelector(selector).classList.toggle('d-none');
  });
}

function toggleSection(selector, show) {

  if (show == "yes") {
    if ($(selector).hasClass("d-none")) $(selector).removeClass("d-none");
  } else if (show == "no") {
    if (!$(selector).hasClass("d-none")) $(selector).addClass("d-none");
  } else {
    $(selector).toggleClass("d-none");
  }

}

function copyContent(selector) {

  let element = document.querySelector(selector);
  if (element) {
    return element.innerHTML;
  } else return "Element not found";

}

function toggleDropData(elem, selector) {

  elem.classList.toggle("upside-down");
  toggleSection(selector);

}

function title(value = "") {

  if (typeof value === 'string') {

    let clean = value.replace(/[-_,:;"'.]/g, " ");
    let capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
    return capitalized;

  } else return value;

}

function calculateRows(str, char_per_line = 100) {

  if (str != '') {

    let text = String(str);
    let lines = Math.ceil(text.length / char_per_line);
    return lines;

  } else return 1;

}

function isNumber(value) {
  return /^\d+(\.\d+)?$/.test(value);
}


function renderJSONInfo(data, exclude = []) {

  let render = "";

  for (const prop in data) {

    if (exclude.includes(prop)) continue;

    if (typeof data[prop] === "object") {

      if (Array.isArray(data[prop])) {

        if (data[prop].length > 0) {

          // nested block
          render += `
              <details>
                  <summary class="bg-gray p-1 clickable-h border-start border-3 border-primary">
                      <strong class="">${title(isNumber(prop) ? parseInt(prop) + 1 : prop)} :</strong>
                  </summary>
                  <div class="border-start border-3 ps-3">${renderJSONInfo(data[prop])}</div>
              </details>
          `;

        }

      } else {

        if (data[prop] && Object.keys(data[prop])?.length > 0) {

          // nested block
          render += `
              <details>
                  <summary class="bg-gray p-1 clickable-h border-start border-3 border-primary">
                      <strong class="">${title(prop)} :</strong>
                  </summary>
                  <div class="border-start border-3 ps-3">${renderJSONInfo(data[prop])}</div>
              </details>
          `;

        }

      }

    } else {

      // render block
      render += `
      <div class="ps-2 border-start border-3 border-primary border-b-mini">
          <div class="p-1 border-0 fw-bold">
              ${title(isNumber(prop) ? parseInt(prop) + 1 : prop)} :
          </div>
          <div class="p-1 text-break ps-3">${data[prop] || 'No information'}</div>
      </div>
      `;

    }

  }

  return render;

}

// used in pagination that traverse the pages after submiting assigned forms
function visitPage(pageNumber, form_selector) {

  let page = parseInt(pageNumber < 1 ? 1 : pageNumber);

  // update the page number
  $(`${form_selector} input[name=page]`).val(page);

  // submit the form
  let form = $(form_selector)[0];

  console.log(form_selector);

  form.submit();

}

function fetchDropData(selector, collection, id, exclude) {

  let container = $(selector);

  if (collection) {

    container.html(TEMPLATE.loader);

    $.ajax({

      url: `/content/fetch/one?id=${id}&collection=${collection}&exclude=${exclude}`,
      type: 'GET',

      success: (data) => {

        container.html(renderJSONInfo(data));

      },

      statusCode: {

        404: function () {

          container.html(EMSG.notFound("data"));

        },

        500: function () {

          container.html(EMSG.server);

        }

      }

    });

  } else {

    console.err("fetchDropData", "collection or id is not defined");

  }

}

function fetchDropdownData(selector, collection, idf, value, exclude) {

  let container = $(selector);

  if (collection) {

    container.html(TEMPLATE.loader);

    $.ajax({

      url: `/content/fetch/single?idf=${idf}&value=${value}&collection=${collection}&exclude=${exclude}`,
      type: 'GET',

      success: (data) => {

        container.html(renderJSONInfo(data));

      },

      statusCode: {

        404: function () {

          container.html(EMSG.notFound("data"));

        },

        500: function () {

          container.html(EMSG.server);

        }

      }

    });

  } else {

    console.err("fetchDropData", "collection or id is not defined");

  }

}

function filterStatus(id) {

  const status = document.getElementById(id);
  status.classList.add("active-header");

}

function customConfirm(message) {
  return new Promise((resolve) => {

    // Get modal elements
    const modal = document.getElementById('confirm-modal');
    const confirmMessage = document.getElementById('confirmMessage');
    const yesButton = document.getElementById('confirmYes');
    const noButton = document.getElementById('confirmNo');

    // Set the message
    confirmMessage.textContent = message;

    // Display the modal
    modal.classList.remove('d-none');

    // Handle Yes button click
    yesButton.onclick = function () {
      modal.classList.add('d-none');
      resolve(true); // Return true on Yes
    };

    // Handle No button click
    noButton.onclick = function () {
      modal.classList.add('d-none');
      resolve(false); // Return false on No
    };

  });
}

// overwritting default confirm box
async function confirmChoice(event, message) {

  event.preventDefault();

  customConfirm(message).then(confirmed => {

    if (confirmed) {
      const target = event.target.closest('a, form');
      if (target && target.tagName === 'A') {
        // If it's a hyperlink, navigate to the href
        window.location.href = target.href;
      } else if (target && target.tagName === 'FORM') {
        // If it's a button, trigger the form submission
        target.submit();
      }
    }

  });

}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    toast('Text Copied', 'Copied to clipboard', 4);
  }).catch(err => {
    console.error('Could not copy text: ', err);
  });
}

function loadWorkflow(selectbox, user_list) {

  let sid = selectbox?.value;
  let container = "#workflow-preview";

  if (user_list) {

    // load from object
    let preloaded_users = user_list?.map(ustr => {
      let user = ustr?.split("-");
      return { sid: user[1], type: user[0] }
    }) || [];

    loadUsers(preloaded_users);

  } else if (sid) {

    fetchDynamicData({
      container, url: `/dashboard/workflow/info?sid=${sid}`
    }, (response) => {

      let preloaded_users = response?.users?.map(user => {
        return { sid: user.sid, type: 'phase1' }
      }) || [];

      loadUsers(preloaded_users);

    })

  }

}

window.onload = (e) => {

  const toggle_blocks = document.querySelectorAll(".toggle-block");

  toggle_blocks.forEach(block => {

    block.addEventListener("click", e => {

      const target = e.target;
      if (target.classList.contains("btn-tab-off") || target.classList.contains("btn-tab")) {
        const all_btns = block.querySelectorAll("button");
        all_btns.forEach(btn => {
          btn.classList.remove("btn-tab");
          btn.classList.add("btn-tab-off");
        });
        target.classList.add("btn-tab");
        target.classList.remove("btn-tab-off");
      }
    })

  });


  if ($('.toast').length > 0) {
    $('.toast').toast('show');
  }

  $(document).click(function (event) {

    if (!$(event.target).closest(".toggler").length) {

      if (!$("#sidebar-con").hasClass("d-none")) {

        if (!$(event.target).closest("#sidebar-con").length) {

          toggleSidebar();

        }

      }

    }

  });

}

// it waits for an element to appear dynamically into the DOM, after it's ready it returns the element
function waitForElement(id, timeout = 5000) {
  return new Promise((resolve, reject) => {
    // Check if element already exists
    const el = document.getElementById(id);
    if (el) return resolve(el);

    // Create a MutationObserver to watch for changes
    const observer = new MutationObserver((mutations, obs) => {
      const element = document.getElementById(id);
      if (element) {
        obs.disconnect(); // stop observing
        resolve(element);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Optional timeout
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element with id "${id}" not found in ${timeout}ms`));
    }, timeout);
  });
}