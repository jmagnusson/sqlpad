import React from 'react'
import { Creatable } from 'react-select'
import Alert from 'react-s-alert'
import AceEditor from 'react-ace'
import 'brace/mode/sql'
import 'brace/theme/sqlserver'
import 'brace/ext/searchbox'
import Nav from 'react-bootstrap/lib/Nav'
import NavItem from 'react-bootstrap/lib/NavItem'
import Form from 'react-bootstrap/lib/Form'
import FormGroup from 'react-bootstrap/lib/FormGroup'
import FormControl from 'react-bootstrap/lib/FormControl'
import ControlLabel from 'react-bootstrap/lib/ControlLabel'
import Button from 'react-bootstrap/lib/Button'
import Glyphicon from 'react-bootstrap/lib/Glyphicon'
import Modal from 'react-bootstrap/lib/Modal'
import Tooltip from 'react-bootstrap/lib/Tooltip'
import OverlayTrigger from 'react-bootstrap/lib/OverlayTrigger'
import HelpBlock from 'react-bootstrap/lib/HelpBlock'
import fetchJson from '../utilities/fetch-json.js'
import uuid from 'uuid'
import keymaster from 'keymaster'
import SchemaInfo from '../components/SchemaInfo.js'
import QueryResultDataTable from '../components/QueryResultDataTable.js'
import QueryResultHeader from '../components/QueryResultHeader.js'
import ChartInputs from '../components/ChartInputs.js'
import SqlpadTauChart from '../components/SqlpadTauChart.js'
import chartDefinitions from '../components/ChartDefinitions.js'

class QueryDetailsModal extends React.Component {
  state = {
    showModal: false
  }

  close = () => {
    if (this.saveOnClose) {
      setTimeout(this.props.saveQuery, 750)
      this.saveOnClose = false
    }
    this.setState({ showModal: false })
  }

  input = undefined

  open = () => {
    this.setState({ showModal: true })
  }

  openForSave = () => {
    this.saveOnClose = true
    this.setState({ showModal: true })
  }

  onSubmit = e => {
    e.preventDefault()
    this.close()
  }

  onQueryNameChange = e => {
    var newName = e.target.value
    this.props.onQueryNameChange(newName)
  }

  onEntered = () => {
    if (this.input) this.input.focus()
  }

  render () {
    var modalNavLink = (href, text) => {
      var saved = !!this.props.query._id
      if (saved) {
        return (
          <li role='presentation'>
            <a href={href} target='_blank' rel='noopener noreferrer'>
              {text} <Glyphicon glyph='new-window' />
            </a>
          </li>
        )
      } else {
        var tooltip = (
          <Tooltip id='tooltip'>
            Save query to enable table/chart view links
          </Tooltip>
        )
        return (
          <OverlayTrigger placement='top' overlay={tooltip}>
            <li role='presentation' className='disabled'>
              <a
                href={href}
                target='_blank'
                rel='noopener noreferrer'
                onClick={e => e.preventDefault()}
              >
                {text} <Glyphicon glyph='new-window' />
              </a>
            </li>
          </OverlayTrigger>
        )
      }
    }
    var validationState = this.saveOnClose && !this.props.query.name.length
      ? 'warning'
      : null
    var validationHelp = this.saveOnClose && !this.props.query.name.length
      ? <HelpBlock>Query name is required to save query.</HelpBlock>
      : null
    return (
      <Modal
        onEntered={this.onEntered}
        animation
        show={this.state.showModal}
        onHide={this.close}
      >
        <Modal.Header closeButton />
        <Modal.Body>
          <form onSubmit={this.onSubmit}>
            <FormGroup validationState={validationState}>
              <ControlLabel>Query Name</ControlLabel>
              <input
                className='form-control'
                ref={ref => {
                  this.input = ref
                }}
                type='text'
                value={this.props.query.name}
                onChange={this.onQueryNameChange}
              />
              <FormControl.Feedback />
              {validationHelp}
            </FormGroup>
            <br />
            <FormGroup>
              <ControlLabel>Query Tags</ControlLabel>
              <Creatable
                name='query-tags-field'
                value={this.props.query.tags}
                multi
                placeholder=''
                options={this.props.tagOptions}
                onChange={this.props.onQueryTagsChange}
              />
            </FormGroup>
            <br />
            <ul className='nav nav-pills nav-justified'>
              {modalNavLink('?format=table', 'Link to Table')}
              {modalNavLink('?format=chart', 'Link to Chart')}
            </ul>
          </form>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={this.close}>Close</Button>
        </Modal.Footer>
      </Modal>
    )
  }
}

class QueryEditor extends React.Component {
  loadConnectionsFromServer = () => {
    fetchJson('GET', this.props.config.baseUrl + '/api/connections/')
      .then(json => {
        if (json.error) Alert.error(json.error)
        const connections = json.connections
        const query = this.state.query
        // if only 1 connection auto-select it
        if (connections.length === 1 && this.state.query) {
          query.connectionId = connections[0]._id
        }
        this.setState({
          connections: connections,
          query: query
        })
      })
      .catch(ex => {
        console.error(ex.toString())
        Alert.error('Something is broken')
      })
  }

  loadQueryFromServer = queryId => {
    fetchJson('GET', this.props.config.baseUrl + '/api/queries/' + queryId)
      .then(json => {
        if (json.error) Alert.error(json.error)
        this.setState({
          query: json.query
        })
      })
      .catch(ex => {
        console.error(ex.toString())
        Alert.error('Something is broken')
      })
  }

  state = {
    activeTabKey: 'sql',
    cacheKey: uuid.v1(),
    connections: [],
    availableTags: [],
    isSaving: false,
    isRunning: false,
    isDirty: false,
    runQueryStartTime: undefined,
    queryResult: undefined,
    query: {
      _id: '',
      name: '',
      tags: [],
      connectionId: '',
      queryText: '',
      chartConfiguration: {
        chartType: '',
        fields: {} // key value for chart
      }
    }
  }

  saveQuery = () => {
    var query = this.state.query
    if (!query.name) {
      this.queryDetailsModal.openForSave()
      return
    }
    this.setState({ isSaving: true })
    if (query._id) {
      fetchJson(
        'PUT',
        this.props.config.baseUrl + '/api/queries/' + query._id,
        query
      )
        .then(json => {
          if (json.error) {
            Alert.error(json.error)
            this.setState({ isSaving: false })
            return
          }
          Alert.success('Query Saved')
          this.setState({
            isSaving: false,
            query: json.query
          })
        })
        .catch(ex => {
          console.error(ex.toString())
          Alert.error('Something is broken')
        })
    } else {
      fetchJson('POST', this.props.config.baseUrl + '/api/queries', query)
        .then(json => {
          if (json.error) {
            Alert.error(json.error)
            this.setState({ isSaving: false })
            return
          }
          window.history.replaceState(
            {},
            json.query.name,
            this.props.config.baseUrl + '/queries/' + json.query._id
          )
          Alert.success('Query Saved')
          this.setState({
            isSaving: false,
            query: json.query
          })
        })
        .catch(ex => {
          console.error(ex.toString())
          Alert.error('Something is broken')
        })
    }
  }

  queryDetailsModal = undefined

  openQueryDetailsModal = () => {
    this.queryDetailsModal.open()
  }

  onConnectionChange = connectionId => {
    var query = this.state.query
    query.connectionId = connectionId
    this.setState({
      query: query
    })
  }

  onQueryNameChange = name => {
    var query = this.state.query
    query.name = name
    this.setState({ query: query })
  }

  onQueryTagsChange = values => {
    var query = this.state.query
    query.tags = values.map(v => v.value)
    this.setState({ query: query })
  }

  onQueryTextChange = queryText => {
    var query = this.state.query
    query.queryText = queryText
    this.setState({
      query: query
    })
  }

  onChartTypeChange = e => {
    var chartType = e.target.value
    const { query } = this.state
    query.chartConfiguration.chartType = chartType
    this.setState({ query })
  }

  runQuery = () => {
    const { cacheKey, query } = this.state
    var editor = this.editor
    var selectedText = editor.session.getTextRange(editor.getSelectionRange())
    var queryToRun = selectedText || query.queryText
    this.setState({
      isRunning: true,
      runQueryStartTime: new Date()
    })
    setTimeout(this.runningTimer, 60)
    var postData = {
      connectionId: query.connectionId,
      cacheKey,
      queryName: query.name,
      queryText: queryToRun
    }
    fetchJson('POST', this.props.config.baseUrl + '/api/query-result', postData)
      .then(json => {
        if (json.error) Alert.error(json.error)
        this.setState({
          isDirty: false,
          isRunning: false,
          queryError: json.error,
          queryResult: json.queryResult
        })
      })
      .catch(ex => {
        console.error(ex.toString())
        Alert.error('Something is broken')
      })
  }

  loadTagsFromServer = () => {
    fetchJson('GET', this.props.config.baseUrl + '/api/tags')
      .then(json => {
        if (json.error) Alert.error(json.error)
        this.setState({ availableTags: json.tags })
      })
      .catch(ex => {
        console.error(ex.toString())
        Alert.error('Something is broken')
      })
  }

  componentWillReceiveProps (nextProps) {
    if (nextProps.queryId !== 'new') {
      this.loadQueryFromServer(nextProps.queryId)
    } else if (nextProps.queryId === 'new') {
      this.setState({
        activeTabKey: 'sql',
        queryResult: undefined,
        query: {
          _id: '',
          name: '',
          tags: [],
          connectionId: '',
          queryText: '',
          chartConfiguration: {
            chartType: '',
            fields: {} // key value for chart
          }
        }
      })
    }
  }

  componentDidMount () {
    const { config, queryId } = this.props
    this.loadConnectionsFromServer()
    this.loadTagsFromServer()
    if (queryId !== 'new') {
      this.loadQueryFromServer(queryId)
    }

    if (this.editor) {
      this.editor.focus()

      // augment the built-in behavior of liveAutocomplete
      // built-in behavior only starts autocomplete when at least 1 character has been typed
      // In ace the . resets the prefix token and clears the completer
      // In order to get completions for 'sometable.' we need to fire the completer manually
      const editor = this.editor
      editor.commands.on('afterExec', function (e) {
        if (e.command.name === 'insertstring' && /^[\w.]$/.test(e.args)) {
          if (e.args === '.') {
            editor.execCommand('startAutocomplete')
          }
        }
      })
      if (config.editorWordWrap) {
        this.editor.session.setUseWrapMode(true)
      }
    }

    /*  Shortcuts
    ============================================================================== */
    // keymaster doesn't fire on input/textarea events by default
    // since we are only using command/ctrl shortcuts,
    // we want the event to fire all the time for any element
    keymaster.filter = function (event) {
      return true
    }
    keymaster.unbind('ctrl+s, command+s')
    keymaster('ctrl+s, command+s', e => {
      this.saveQuery()
      e.preventDefault()
      return false
    })
    // there should only ever be 1 QueryEditor on the page,
    // but just in case there isn't unbind anything previously bound
    // rather something previously not run than something run more than once
    keymaster.unbind('ctrl+r, command+r, ctrl+e, command+e')
    keymaster('ctrl+r, command+r, ctrl+e, command+e', e => {
      this.runQuery()
      e.preventDefault()
      return false
    })
  }

  componentWillUnmount () {
    keymaster.unbind('ctrl+s, command+s')
    keymaster.unbind('ctrl+r, command+r, ctrl+e, command+e')
  }

  onChartConfigurationFieldsChange = (chartFieldId, queryResultField) => {
    const { query } = this.state
    query.chartConfiguration.fields[chartFieldId] = queryResultField
    this.setState({ query })
  }

  sqlpadTauChart = undefined

  hasRows = () => {
    const queryResult = this.state.queryResult
    return !!(queryResult && queryResult.rows && queryResult.rows.length)
  }

  isChartable = () => {
    const pending = this.state.isRunning || this.state.queryError
    return !pending && this.state.activeTabKey === 'vis' && this.hasRows()
  }

  onVisualizeClick = e => {
    this.sqlpadTauChart.renderChart(true)
  }

  onTabSelect = tabkey => {
    this.setState({ activeTabKey: tabkey })
  }

  onSaveImageClick = e => {
    if (this.sqlpadTauChart && this.sqlpadTauChart.chart) {
      this.sqlpadTauChart.chart.fire('exportTo', 'png')
    }
  }

  render () {
    const { activeTabKey, availableTags, query } = this.state
    document.title = query.name ? query.name : 'New Query'
    const tagOptions = availableTags.map(t => {
      return { value: t, label: t }
    })
    if (query && query.tags) {
      query.tags.forEach(t => {
        tagOptions.push({ value: t, label: t })
      })
    }
    const chartOptions = chartDefinitions.map(d => {
      return (
        <option key={d.chartType} value={d.chartType}>
          {d.chartLabel}
        </option>
      )
    })
    const sqlDisplay = activeTabKey === 'sql' ? 'flex' : 'none'
    const visDisplay = activeTabKey === 'vis' ? 'flex' : 'none'
    return (
      <div className='flex-100' style={{ flexDirection: 'column' }}>
        <div className='clearfix navbar-default'>
          <Nav
            activeKey={this.state.activeTabKey}
            bsStyle='pills'
            className='navbar-left'
            style={{ paddingLeft: 6, marginTop: 6 }}
            onSelect={this.onTabSelect}
          >
            <NavItem eventKey='sql'>
              <span className='glyphicon glyphicon-align-left' /> SQL
            </NavItem>
            <NavItem eventKey='vis'>
              <span className='glyphicon glyphicon-stats' /> Vis
            </NavItem>
          </Nav>
          <Form inline className='navbar-form'>
            <Button
              className='QueryEditorSubheaderItem'
              onClick={this.saveQuery}
              disabled={this.state.isSaving}
            >
              <span className='shortcut-letter'>S</span>
              {this.state.isSaving ? 'aving' : 'ave'}
            </Button>
            <Button
              className='QueryEditorSubheaderItem'
              onClick={this.runQuery}
              disabled={this.state.isRunning}
            >
              <span className='shortcut-letter'>R</span>
              {this.state.isRunning ? 'unning' : 'un'}
            </Button>
            <ControlLabel
              onClick={this.openQueryDetailsModal}
              className='QueryEditorSubheaderItem QueryEditorQueryName'
            >
              {this.state.query.name
                ? this.state.query.name
                : '(click to name query)'}
            </ControlLabel>
            <QueryDetailsModal
              onQueryNameChange={this.onQueryNameChange}
              onQueryTagsChange={this.onQueryTagsChange}
              saveQuery={this.saveQuery}
              query={this.state.query}
              tagOptions={tagOptions}
              ref={ref => {
                this.queryDetailsModal = ref
              }}
            />
          </Form>
        </div>
        <div className='flex-100' style={{ flexGrow: 1 }}>
          <div style={{ display: sqlDisplay, width: '100%' }}>
            <SchemaInfo
              {...this.props}
              connections={this.state.connections}
              connectionId={this.state.query.connectionId}
              onConnectionChange={this.onConnectionChange}
            />
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flexGrow: 1
              }}
            >
              <AceEditor
                mode='sql'
                theme='sqlserver'
                name='query-ace-editor'
                width='100%'
                height='50%'
                showGutter={false}
                showPrintMargin={false}
                highlightActiveLine={false}
                onChange={this.onQueryTextChange}
                value={this.state.query.queryText}
                editorProps={{ $blockScrolling: Infinity }}
                enableBasicAutocompletion
                enableLiveAutocompletion
                ref={ref => {
                  this.editor = ref ? ref.editor : null
                }}
              />
              <QueryResultHeader
                {...this.props}
                isRunning={this.state.isRunning}
                runQueryStartTime={this.state.runQueryStartTime}
                cacheKey={this.state.cacheKey}
                runSeconds={this.state.runSeconds}
                queryResult={this.state.queryResult}
              />
              <div style={{ height: '50%', display: 'flex' }}>
                <QueryResultDataTable
                  {...this.props}
                  isRunning={this.state.isRunning}
                  queryResult={this.state.queryResult}
                  queryError={this.state.queryError}
                />
              </div>
            </div>
          </div>
          <div style={{ display: visDisplay, width: '100%' }}>
            <div className='sidebar'>
              <div className='sidebar-body'>
                <FormGroup controlId='formControlsSelect' bsSize='small'>
                  <FormControl
                    value={this.state.query.chartConfiguration.chartType}
                    onChange={this.onChartTypeChange}
                    componentClass='select'
                    className='input-small'
                  >
                    <option value=''>Choose a chart type...</option>
                    {chartOptions}
                  </FormControl>
                </FormGroup>
                <ChartInputs
                  chartType={this.state.query.chartConfiguration.chartType}
                  queryChartConfigurationFields={
                    this.state.query.chartConfiguration.fields
                  }
                  onChartConfigurationFieldsChange={
                    this.onChartConfigurationFieldsChange
                  }
                  queryResult={this.state.queryResult}
                />
              </div>
              <div className='sidebar-actions-bottom'>
                <Button
                  onClick={this.onVisualizeClick}
                  disabled={!this.isChartable()}
                  className={'btn-block'}
                  bsSize={'sm'}
                >
                  Visualize
                </Button>
                <Button
                  onClick={this.onSaveImageClick}
                  className={'btn-block'}
                  bsSize={'sm'}
                >
                  <Glyphicon glyph='save' /> Save Chart Image
                </Button>
              </div>
            </div>
            <div className='flex-grow-1'>
              <SqlpadTauChart
                config={this.props.config}
                query={this.state.query}
                queryResult={this.state.queryResult}
                queryError={this.state.queryError}
                isRunning={this.state.isRunning}
                renderChart={this.isChartable()}
                ref={ref => {
                  this.sqlpadTauChart = ref
                }}
              />
            </div>
          </div>
        </div>
        <Alert stack={{ limit: 3 }} position='bottom-right' />
      </div>
    )
  }
}

export default QueryEditor