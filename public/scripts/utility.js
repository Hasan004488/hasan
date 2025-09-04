/* 
Attention!
These scripts appear at the top of the layout affecting any places in a page 
*/

// QUERY_PER_LOAD calls will be made by data-table to load data
window.EITIX_AJAX_REQUESTS = [];
window.EITIX_LOAD_RUNNING = false;
window.EITIx_QUERY_PER_LOAD = 30;

const EMSG = {
  notFound(content = "information") {
    return `No ${content} found!`;
  },
  server: "An internal server error encountered!"
}

const TEMPLATE = {

  loader: `
      <div class="spinner-grow text-primary text-center" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    `,

  loader_sm: `
      <div class="spinner-grow spinner-grow-sm text-primary text-center" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    `,

  alert: {
    danger: (message) => {
      return `
            <div class="alert alert-danger py-2 mt-2">
                <i class="fa fa-ban me-2"></i>
                ${message}
            </div>
            `
    }
  }

}

const QUILL_OPTIONS = {
  placeholder: 'Write using formatting text...',
  theme: 'snow',
  modules: {
    toolbar: [
      [{ 'header': [3, 4, 5, 6, false] }],
      [{
        color: [
          '#ff7f3f', '#b0440f', '#702b09', '#5e6580', '#198754',
          '#0dcaf0', '#df3838', '#21293d', '#808080', false
        ]
      }, 'bold', 'italic', 'underline', 'strike', false],
      ['link', 'code', 'blockquote'],
      [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
      [{ align: [] }],
      ['clean'],
    ]
  }
};

function getElapsedTime(time) {

  if (!time || time == 'A lot earlier') return 'A lot earlier';

  time = new Date(time);
  let now = new Date().getTime();
  let diffInMs = Math.abs(now - time);
  let diffInMinutes = Math.round(diffInMs / (1000 * 60));
  let diffInHours = Math.round(diffInMs / (1000 * 60 * 60));
  let diffInDays = Math.round(diffInMs / (1000 * 60 * 60 * 24));
  let diffInMonths = Math.round(diffInMs / (1000 * 60 * 60 * 24 * 12));

  if (diffInMinutes < 60) {

    if (diffInMinutes < 1) {

      return 'Just now';

    } else {

      return diffInMinutes + ' minute(s) ago';

    }

  } else if (diffInHours < 24) {

    return diffInHours + ' hour(s) ago';

  } else if (diffInDays < 30) {

    return diffInDays + ' day(s) ago';

  } else {

    return diffInMonths + ' month(s) ago';

  }

}

function get(selector) {

  return document.querySelector(selector);

}

function generateRandomID(length) {

  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let randomID = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    randomID += characters.charAt(randomIndex);
  }

  return randomID;

}

function formatNumber(number) {

  if (!number) return 0;

  if (number < 1000) {
    return number.toString();
  } else if (number < 1000000) {
    return (number / 1000).toFixed(1) + 'K';
  } else if (number < 1000000000) {
    return (number / 1000000).toFixed(1) + 'M';
  } else {
    return (number / 1000000000).toFixed(1) + 'B';
  }

}

async function countData() {

  const data_count = $("#data-total");
  const data_count_info = $("#data-total-info");

  data_count.text("...");

  try {

    await $.ajax({

      url: current_url + "&count=1",
      type: 'GET',
      success: (data) => {

        let total = data.total || 0;

        // update page number
        //if (total % QUERY_LIMIT > page) page++;

        total_results = total;
        data_count.text(formatNumber(total));
        data_count_info.attr("title", total);

      },
      error: (xhr, status, err) => {

        throw (err);

      }
    });


  } catch (err) {

    console.error(err);
    toast("EITIx Server Error", "Please check console", 1);

  }
}

async function loadData(overwrite = false, reset = false, query = "", amount = EITIx_QUERY_PER_LOAD) {

  const container = $("#table-data");
  const loading_stat = $("#data-loading");
  const loading_bar = $("#data-loading-bar");
  const loader = $("#data-loader");
  const empty_status = $("#data-table-empty");

  let keep_fetching = true;

  try {

    if (EITIX_LOAD_RUNNING) {

      // kill the previous calls
      EITIX_AJAX_REQUESTS.forEach(req => {
        if (req && typeof req.abort === 'function') {
          req.abort();
        }
      });
      EITIX_AJAX_REQUESTS = [];
      if (overwrite) {
        container.html("");
      }
      EITIX_LOAD_RUNNING = false;

    }

    EITIX_LOAD_RUNNING = true;
    dataLoading(true);
    manageQuery();

    for (let index = 0; index < amount; index++) {

      /* console.log("utility.js", current_url + `&page=${page}&collection=${collection}`); */
      /* console.log("utility.js", page, collection); */

      let request = $.ajax({
        url: current_url + `&page=${page}&collection=${collection}&view=${view}`,
        type: 'GET'
      });
      EITIX_AJAX_REQUESTS.push(request);

      let response = await request;

      if (!response || response.trim() === "<!-- dynamic component -->") {

        // the response is empty 
        // that means not more data to search
        keep_fetching = false;
        break;

      } else if (response === "404") {

        // the response is 404
        // this indicating the end of the data of a colleciton
        // now the collection must be incremented
        // required for multi-collection load (ex: wazuh logs)
        collection++;
        page = 1;
        continue;

      } else {

        // data loaded successfully
        keep_fetching = true;

        // increment cursor
        load_amount++;
        page++;

        // update loading progress
        let percentage = ((page % amount) / amount) * 100;
        loading_bar.css({ width: Math.min(percentage, 100) + "%" });
        dataLoading(true);

        // update the table
        container.append(response);

      }

    }

    // loop completed
    EITIX_LOAD_RUNNING = false;
    dataLoading(false);

    // function calls
    function manageQuery() {
      if (query !== "") {

        // query passed into this load data operation
        current_url = default_url + default_query + query;

      } else if (default_query !== "") {

        // query from the url = default query
        current_url = default_url + default_query;

      }

      // reset the search query
      if (reset) {
        current_url = default_url;
        default_query = "";
        search = {};
        resetSearchForm("search-form");
      }

      // overwrite previous data in the table
      if (overwrite || reset) {
        load_amount = 0;
        page = 1;
        collection = 1;
        container.html("");
        countData();
      }
    }

  } catch (err) {

    if (err.statusText === 'abort') {

      // ignore this error

    } else {

      console.error(err);
      toast("Something went wrong!", "Can't load this page properly. Please check console", 1);

    }

    return dataLoading(false);

  }

  function dataLoading(status) {
    if (status) {

      // this means loading is in progress
      loading_stat.removeClass("d-none");

    } else {

      loading_stat.addClass("d-none");
      loading_bar.css({ width: "0" });

    }
    if (keep_fetching) {

      // loader should stay hidden until new search happens and new data is found
      loader.removeClass("d-none");

    } else {

      loader.addClass("d-none");

    }
    if (load_amount > 0) {

      empty_status.addClass("d-none");

    } else {

      // showing the table is empty status
      empty_status.removeClass("d-none");

    }
  }

}

async function changeURL(url) {

  default_url = url + "?";
  current_url = default_url;
  loadData(true, true);

}

async function updateData(message, url, id, type = "POST", form_data = null) {

  if (message) {

    let confirm = await customConfirm(message);

    if (!confirm) {
      return false;
    }

  }

  let serialize_data = {};

  if (form_data) {

    serialize_data = form_data;
    serialize_data.id = id;

  } else {

    serialize_data = {
      id
    };

  }

  $.ajax({
    url, type,
    data: serialize_data,
    success: (response) => {

      loadData(true, true);
      toast("Update Success", response.status, 1);
      return true;

    },
    error: (xhr, status, err) => {

      console.error(err);
      toast("Something went wrong", "Please check out the console", 1);
      return false;

    }
  });

}

// fetch dynamic data from an API URL
function fetchDynamicData(data, callback) {

  // callback(response, error)
  // container = container selector

  let { container, url, type = "GET" } = data;

  if (container) $(container).addClass("loading-state");

  $.ajax({
    url, type,
    success: (response) => {

      if (container) $(container).removeClass("loading-state");
      return callback(response, null);

    },
    error: (err) => {

      console.error(err);
      /* toast("EITIx Server Error", "Please check console...", 2); */
      if (container) $(container).removeClass("loading-state");

      return callback(null, err);

    }
  });

}

// fetch dynamic data repeatedly after an interval
function loadDynamicData(data, callback, interval) {

  // { container, url, type = "GET" } = data;

  fetchDynamicData(data, callback);

  // clear any previous loops
  clearInterval(window["eitix-load-" + data.container]);

  window["eitix-load-" + data.container] = setInterval(() => {

    fetchDynamicData(data, callback);

  }, interval);

}

/**
 * Opens a popup with title and loads content from given URL.
 * Content is expected to be a JSON object.
 * @param {string} title - Title of the popup.
 * @param {string} url - URL to fetch content from.
 */
function loadDynamicPopup(title, url) {

  fetchDynamicData({ url }, (response) => {

    togglePopup(title, renderJSONInfo(response));

  })

}

function updateSearch(field, value, oparator, group) {

  if (group) {
    search[group] = {
      [field]: value
    };
    if (oparator) {
      search[group]["op_" + field] = oparator;
    }
  } else {
    search[field] = value;
    if (oparator) search["op_" + field] = oparator;
  }

  let normalize_search = Object.entries(search).reduce((acc, [key, value]) => {
    if (typeof value === 'object') {
      Object.keys(value).forEach(subKey => {
        acc[subKey] = value[subKey];
      });
    } else {
      acc[key] = value;
    }
    return acc;
  }, {});

  /* console.log("utility.js", normalize_search); */

  let search_query = new URLSearchParams(normalize_search).toString();

  return search_query;

}

function resetSearchForm(form_selector) {

  const form = document.getElementById(form_selector);
  if (form) form.reset();

  const activeHeaders = document.querySelectorAll('.active-header');
  activeHeaders.forEach(header => {
    header.classList.remove('active-header');
  })

}

function submitForm(form_selector, callback) {

  let form = $(form_selector);

  // Get the action URL from the form
  let url = form.attr('action');
  let type = form.attr('method');

  // Serialize the form data
  let data = form.serialize();

  $.ajax({
    url, type, data,
    success: function (response) {
      callback(response);
    },
    error: function (xhr, status, error) {
      toast("Failed", "Encountered problem submitting data in the backend!", 1);
      return callback(null);
    }
  });

}

function toggleDisable(selector) {

  let element = document.querySelector(selector);
  element.classList.toggle("area_disabled");

}

function activeGroup(selector, activeClass) {

  let elements = document.querySelectorAll(selector);
  elements.forEach(elem => {
    elem.addEventListener('click', () => {
      elements.forEach(el => el.classList.remove(activeClass || 'active'));
      elem.classList.add(activeClass || 'active');
    });
  });

}

function getDateString(date, days = 0) {

  // returns date in a format that supported by html
  let today = date || new Date();
  today.setDate(today.getDate() + days);
  return `${pad(today.getFullYear(), 4)}-${pad(today.getMonth() + 1, 2)}-${pad(today.getDate(), 2)}`;

}

function previewWorkflow(selectbox, workflow_data, phase, escalation = false) {

  let sid = selectbox?.value;
  let container = "#workflow-preview";

  if (sid) {

    fetchDynamicData({
      container, url: `/dashboard/workflow/info?sid=${sid}`
    }, (response) => {

      let user_list = '';

      response?.users?.forEach(user => {

        if (phase) {

          if (user?.phase === phase) {
            user_list += renderUser(user, escalation);
          }

        } else {

          user_list += renderUser(user, escalation);

        }

      });

      let raw_html = renderContainer(user_list, escalation);
      $(container).html(raw_html);

    })

  } else if (workflow_data) {

    // load from workflow_data
    let user_list = '';
    workflow_data?.users?.forEach(user => {
      user_list += renderUser(user, escalation);
    });

    let raw_html = renderContainer(user_list, escalation);
    $(container).html(raw_html);

  } else {

    $(container).html("No user found for this workflow");

  }

  function renderContainer(user_list_html, escalation = false) {

    return `
      <div class="py-1 px-3 d-flex justify-content-between border-2 border-bottom mb-3 fw-bold small">
        <div class="col-4">
            Selected User
        </div>
        ${escalation ? "" : `<div class="col-4 text-center">
            Escalation Phase
        </div>`}
        <div class="col-4 text-center">
            Forward Status
        </div>
      </div>
      <div class="user-container d-flex flex-column gap-3 mb-3">
        ${user_list_html}
      </div>
    `;

  }

  function renderUser(user, escalation = false) {

    return `
      <div class="text-seoncdary py-2 px-3 border bg-hover rounded-3 d-flex justify-content-between align-items-center">
        <div class="col-4 small d-flex gap-3 align-items-center">
            <div class="fs-3"> <i class="fa fa-user"></i> </div>
            <div>
                <strong>
                    ${user.full_name || 'This user does not exist.'}
                </strong>
                <div class="text-muted">
                    <span class="badge bg-primary">${user.role}</span> |
                    ${user.sid}
                </div>
            </div>
        </div>
        ${escalation ? "" : `<div class="col-4 text-center">
          <span class="badge bg-white text-dark">
            <i class="fa-solid fa-flag me-1"></i>
            ${user?.phase}
          </span>
        </div>`}
        <div class="col-4 text-center">
            <span class="badge bg-secondary">
              <i class="fa-solid fa-times me-1"></i>
              Non-forwardable
            </span>
        </div>
      </div>
    `;

  }

}

function truncateText(str, limit) {
  return str.length > limit ? str.substring(0, limit - 3) + "..." : str;
}

function changeView(view_name) {

  const all_views = document.querySelectorAll("[table-data-view]");
  const view_elements = document.querySelectorAll(`[table-data-view="${view_name}"]`);

  all_views.forEach(el => el.classList.add("d-none"));
  view_elements.forEach(el => el.classList.remove("d-none"));

  if (view) view = view_name;

}